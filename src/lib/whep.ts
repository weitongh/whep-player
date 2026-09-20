type EventMap = {
  canplay: MediaStream;
  ended: void;
  error: Error;
};

type Listener<E extends keyof EventMap> = (payload: EventMap[E]) => void;

const ICE_GATHERING_TIMEOUT = 3000;
const MIN_RETRY_DELAY = 1000;

export class Whep {
  private pc?: RTCPeerConnection;
  private stream?: MediaStream;
  private sessionUrl?: string;
  private listeners: { [E in keyof EventMap]: Set<Listener<E>> };
  private generation: number;
  private cancelWait?: () => void;

  constructor() {
    this.generation = 0;

    this.listeners = {
      canplay: new Set(),
      ended: new Set(),
      error: new Set(),
    };
  }

  async connect(url: string): Promise<void> {
    if (this.pc) return;

    const generation = ++this.generation;

    try {
      const pc = this.createPeerConnection();

      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      const offer = await pc.createOffer();

      await pc.setLocalDescription(offer);

      if (this.isStale(generation)) return;

      await this.waitForIceGathering(pc);

      if (this.isStale(generation)) return;

      const response = await this.postOffer(
        generation,
        url,
        pc.localDescription!.sdp
      );

      if (!response || this.isStale(generation)) return;

      const sdp = await response.text();

      if (this.isStale(generation)) return;

      const hasCounterOffer = response.status === 406 && this.isSdp(response);

      if (response.status !== 201 && !hasCounterOffer) {
        throw new Error(
          `WHEP POST failed: ${response.status} ${response.statusText}`
        );
      }

      this.sessionUrl = this.resolveSessionUrl(url, response);

      if (hasCounterOffer) {
        await this.answerCounterOffer(generation, pc, sdp);
      } else {
        await pc.setRemoteDescription({ type: "answer", sdp });
      }
    } catch (err) {
      if (this.isStale(generation)) return;

      this.endSession();

      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

  disconnect(): void {
    this.endSession();
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
    for (const fn of this.listeners[event]) {
      fn(payload);
    }
  }

  private isStale(generation: number): boolean {
    return this.generation !== generation;
  }

  private createPeerConnection(): RTCPeerConnection {
    // WHEP mandates a bundled, rtcp-muxed session (spec section 4.6.1).
    const pc = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
    const stream = new MediaStream();

    this.pc = pc;
    this.stream = stream;

    pc.addEventListener("track", ({ track }) => {
      if (pc !== this.pc) return;

      stream.addTrack(track);

      track.addEventListener("ended", () => {
        if (pc !== this.pc) return;

        stream.removeTrack(track);

        if (stream.getTracks().length === 0) {
          this.endSession();

          this.emit("ended", undefined);
        }
      });
    });

    pc.addEventListener("connectionstatechange", () => {
      if (pc !== this.pc) return;

      switch (pc.connectionState) {
        case "connected":
          this.emit("canplay", stream);

          break;

        case "disconnected":
        case "closed":
          this.endSession();

          this.emit("ended", undefined);

          break;

        case "failed":
          this.endSession();

          this.emit("error", new Error("PeerConnection failed"));

          break;
      }
    });

    return pc;
  }

  private resolveSessionUrl(url: string, response: Response): string {
    const location = response.headers.get("Location");

    if (!location) {
      throw new Error(
        "WHEP response is missing the Location header."
      );
    }

    return new URL(location, url).toString();
  }

  private isSdp(response: Response): boolean {
    return (
      response.headers.get("Content-Type")?.includes("application/sdp") ?? false
    );
  }

  private async postOffer(
    generation: number,
    url: string,
    offer: string
  ): Promise<Response | undefined> {
    while (true) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer,
      });

      if (this.isStale(generation)) return undefined;

      if (response.status !== 409) return response;

      const retryAfter = this.parseRetryAfter(response);

      if (retryAfter === undefined) {
        throw new Error(
          "409 Conflict response is missing a usable 'Retry-After' header."
        );
      }

      await this.wait(Math.max(retryAfter, MIN_RETRY_DELAY));

      if (this.isStale(generation)) return undefined;
    }
  }

  private parseRetryAfter(response: Response): number | undefined {
    const header = response.headers.get("Retry-After")?.trim();

    if (!header) return undefined;

    const seconds = Number(header);

    if (Number.isFinite(seconds)) return seconds * 1000;

    const date = Date.parse(header);

    if (!Number.isNaN(date)) return date - Date.now();

    return undefined;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);

        this.cancelWait = undefined;

        resolve();
      };

      const timer = setTimeout(done, ms);

      this.cancelWait = done;
    });
  }

  private async answerCounterOffer(
    generation: number,
    pc: RTCPeerConnection,
    offer: string
  ): Promise<void> {
    await pc.setRemoteDescription({ type: "offer", sdp: offer });

    if (this.isStale(generation)) return;

    const answer = await pc.createAnswer();

    await pc.setLocalDescription(answer);

    if (this.isStale(generation)) return;

    await this.waitForIceGathering(pc);

    if (this.isStale(generation)) return;

    const response = await fetch(this.sessionUrl!, {
      method: "PATCH",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription!.sdp,
    });

    if (this.isStale(generation)) return;

    if (!response.ok) {
      throw new Error(
        `WHEP PATCH failed: ${response.status} ${response.statusText}`
      );
    }
  }

  // Trickle ICE is not implemented, so the local description is only sent once
  // gathering completes (or the timeout elapses) and it carries the full
  // candidate list.
  private waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete") return Promise.resolve();

    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);

        pc.removeEventListener("icegatheringstatechange", onStateChange);

        resolve();
      };

      const onStateChange = () => {
        if (pc.iceGatheringState === "complete") {
          done();
        }
      };

      const timer = setTimeout(done, ICE_GATHERING_TIMEOUT);

      pc.addEventListener("icegatheringstatechange", onStateChange);
    });
  }

  private endSession(): void {
    this.generation++;

    if (this.sessionUrl) {
      void fetch(this.sessionUrl, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});

      this.sessionUrl = undefined;
    }

    this.cancelWait?.();

    this.pc?.close();
    this.pc = undefined;

    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }

    this.stream = undefined;
  }
}
