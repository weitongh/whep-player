import { Device } from "mediasoup-client";
import type {
  Consumer,
  ConsumerOptions,
  RtpCapabilities,
  Transport,
  TransportOptions,
} from "mediasoup-client/types";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

// Client-agnostic mediasoup controller. It manages the streaming lifecycle
// without coupling to the DOM or any UI framework, exposing two typed events:
//   - "stream": (MediaStream)  the remote stream to render
//   - "statusChange": (Status)  the new lifecycle status
// The "statusChange" event fires on every transition and carries the new
// status as its payload.
// Subscribe with on(event, fn) BEFORE calling connect(url); the stream object
// is emitted once and mutated in place as tracks come and go. Detach with
// off(event, fn), passing the same function reference.
// disconnect() tears down the connection only and leaves listeners attached, so
// an instance can be reconnected with connect(url). Callers own their
// subscriptions: every on() needs a matching off(), or the listener and its
// captured scope stay alive for the life of the instance.

export type Status = "idle" | "loading" | "live" | "error";

type EventMap = {
  stream: MediaStream;
  statusChange: Status;
};

type Listener<E extends keyof EventMap> = (payload: EventMap[E]) => void;

type Ack<T> =
  | { status: "ok"; data: T }
  | { status: "error"; error: string };

type JoinData = { rtpCapabilities: RtpCapabilities; producerIds: string[] };

export class Mediasoup {
  private socket?: Socket;
  private device?: Device;
  private transport?: Transport;
  private stream?: MediaStream;
  private consumers: Map<string, Consumer>;
  private status: Status;
  private listeners: { [E in keyof EventMap]: Set<Listener<E>> };
  // Incremented on every connect()/disconnect(). Async work captures the
  // generation it started in and bails if it no longer matches, so an
  // in-flight connect chain cannot mutate a torn-down instance (e.g. under
  // React StrictMode's mount -> unmount -> mount cycle).
  private generation: number;

  constructor() {
    this.consumers = new Map();
    this.status = "idle";
    this.generation = 0;
    this.listeners = {
      stream: new Set(),
      statusChange: new Set(),
    };
  }

  async connect(url: string): Promise<void> {
    if (this.socket) return;

    const generation = ++this.generation;

    this.setStatus("loading");

    this.socket = io(url, {
      reconnectionAttempts: 3,
    });

    this.socket.on("connect", async () => {
      try {
        if (!this.isCurrent(generation)) return;

        if (!this.device) {
          this.device = new Device();
        }

        const ack: Ack<JoinData> = await this.socket!.emitWithAck("join");

        if (!this.isCurrent(generation)) return;

        if (ack.status === "ok") {
          if (!this.device.loaded) {
            const routerRtpCapabilities = ack.data.rtpCapabilities;
            await this.device.load({ routerRtpCapabilities });
            if (!this.isCurrent(generation)) return;
          }

          await this.subscribe(generation, ack.data.producerIds);
        } else {
          throw new Error(ack.error);
        }
      } catch (err) {
        if (!this.isCurrent(generation)) return;
        console.error(err);
        this.setStatus("error");
      }
    });

    this.socket.on("reconnect_failed", () =>
      this.setStatus("error")
    );

    this.socket.on("transportclose", () => this.transport?.close());

    this.socket.on("disconnect", () => {
      this.unsubscribe();
      this.setStatus("idle");
    });
  }

  disconnect(): void {
    // Invalidate any in-flight async work from the active generation.
    this.generation++;

    this.transport?.close();
    this.transport = undefined;

    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = undefined;

    this.device = undefined;
    this.consumers.clear();

    this.setStatus("idle");
  }

  // Registers a listener. Detach with off(event, fn), passing the same
  // reference.
  on<E extends keyof EventMap>(event: E, fn: Listener<E>): void {
    this.listeners[event].add(fn);
  }

  // Removes a previously registered listener. The fn must be the same reference
  // that was passed to on(); unknown listeners are ignored.
  off<E extends keyof EventMap>(event: E, fn: Listener<E>): void {
    this.listeners[event].delete(fn);
  }

  private emit<E extends keyof EventMap>(event: E, payload: EventMap[E]): void {
    for (const fn of this.listeners[event]) fn(payload);
  }

  // Transitions the lifecycle status and notifies listeners. No-op transitions
  // (same status) are ignored so the event only fires on real changes.
  private setStatus(status: Status): void {
    if (this.status === status) return;
    this.status = status;
    this.emit("statusChange", status);
  }

  // True if the given generation is still the active one.
  private isCurrent(generation: number): boolean {
    return this.generation === generation;
  }

  private async subscribe(
    generation: number,
    producerIds?: string[]
  ): Promise<void> {
    await this.createRecvTransport();
    if (!this.isCurrent(generation)) return;

    const stream = this.createStreamSink();

    if (this.consumers.size === 0 && producerIds) {
      for (const producerId of producerIds) {
        await this.consume(generation, stream, producerId);
        if (!this.isCurrent(generation)) return;
      }
    }

    this.socket!.on("newproducer", async ({ producerId }) => {
      await this.consume(generation, stream, producerId);
    });

    this.socket!.on("consumerclose", ({ consumerId }) => {
      const consumer = this.consumers.get(consumerId);
      if (consumer) {
        consumer.close();
        stream.removeTrack(consumer.track);
        this.consumers.delete(consumerId);
        if (stream.getTracks().length === 0) this.setStatus("idle");
      }
    });
  }

  private async createRecvTransport(): Promise<void> {
    const ack: Ack<TransportOptions> =
      await this.socket!.emitWithAck("newtransport");

    if (ack.status === "error") {
      throw new Error(ack.error);
    }

    const transportOptions = ack.data;
    this.transport = this.device!.createRecvTransport(transportOptions);

    this.transport.on(
      "connect",
      async ({ dtlsParameters }, callback, errback) => {
        const ack: Ack<void> = await this.socket!.emitWithAck(
          "transportconnect",
          dtlsParameters
        );

        if (ack.status === "ok") {
          callback();
        } else {
          errback(new Error(ack.error));
        }
      }
    );
  }

  private createStreamSink(): MediaStream {
    this.stream = new MediaStream();

    // Consumers attach this stream to their sink (e.g. a <video> element) via
    // the "stream" event. The lib stays DOM-free and just emits the stream.
    this.emit("stream", this.stream);

    return this.stream;
  }

  private async consume(
    generation: number,
    stream: MediaStream,
    producerId: string
  ): Promise<void> {
    const consumer = await this.createConsumer(producerId);

    // Instance was torn down while the consumer was being created: discard it
    // instead of attaching to a stale stream.
    if (!this.isCurrent(generation)) {
      consumer.close();
      return;
    }

    stream.addTrack(consumer.track);
    this.setStatus("live");

    this.consumers.set(consumer.id, consumer);

    consumer.on("transportclose", () => {
      stream.removeTrack(consumer.track);
      this.consumers.delete(consumer.id);
      if (stream.getTracks().length === 0) this.setStatus("idle");
    });

    const ack: Ack<void> = await this.socket!.emitWithAck(
      "consumerresume",
      consumer.id
    );

    if (!this.isCurrent(generation)) return;

    if (ack.status === "error") {
      stream.removeTrack(consumer.track);
      consumer.close();
      throw new Error(ack.error);
    }
  }

  private async createConsumer(producerId: string): Promise<Consumer> {
    const ack: Ack<ConsumerOptions> = await this.socket!.emitWithAck(
      "newconsumer",
      producerId,
      this.device!.recvRtpCapabilities
    );

    if (ack.status === "error") {
      throw new Error(ack.error);
    }

    const consumerOptions = ack.data;
    const consumer = await this.transport!.consume(consumerOptions);

    return consumer;
  }

  private async unsubscribe(): Promise<void> {
    this.transport?.close();

    this.socket!.removeAllListeners("newproducer");
    this.socket!.removeAllListeners("consumerclose");

    if (!this.socket!.connected) return;

    const ack: Ack<void> = await this.socket!.emitWithAck("transportclose");
    if (ack.status === "error") {
      throw new Error(ack.error);
    }
  }
}
