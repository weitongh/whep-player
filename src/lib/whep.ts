// Client-agnostic WHEP (WebRTC-HTTP Egress Protocol) player, implementing the
// mandatory parts of draft-ietf-wish-whep-04. It manages the streaming
// lifecycle without coupling to the DOM or any UI framework, exposing two
// typed events:
//   - "stream": (MediaStream)  the remote stream to render
//   - "statusChange": (Status)  the new lifecycle status
// The "statusChange" event fires on every transition and carries the new
// status as its payload.
// Subscribe with on(event, fn) BEFORE calling connect(url); the stream object
// is emitted once and mutated in place as tracks come and go. Detach with
// off(event, fn), passing the same function reference.
// Reaching "idle" or "error" ends the session, and disconnect() does the same
// on demand; neither detaches listeners, so an instance is always ready to be
// reconnected with connect(url). Deciding whether to do so is left to the
// consumer: this client never retries a session on its own, so a player that
// should sit and wait for the next broadcast reconnects on "idle"/"error"
// itself.
//
// Protocol flow (spec section 3.2):
//   1. POST the SDP offer ("application/sdp") to the WHEP endpoint URL.
//   2a. "201 Created" + SDP answer -> apply it as the remote description.
//   2b. "406 Not Acceptable" + SDP counter-offer -> apply it as the remote
//       description, then PATCH the SDP answer ("application/sdp") to the WHEP
//       session URL from the Location header and expect "204 No Content".
//   2c. "409 Conflict" + "Retry-After" -> nothing is being published yet; wait
//       out exactly that period and POST again, for as long as it takes (spec
//       section 4.3.9).
//   3. DELETE the WHEP session URL to terminate.
// Trickle ICE and ICE restarts (both only RECOMMENDED) are not implemented:
// the offer/answer is sent after ICE gathering completes instead.

// "connecting" spans the whole setup phase: the offer/answer exchange, any
// "409 Conflict" retry waits, and the ICE/DTLS handshake. "live" means the
// transport is up, which is not quite the same as frames being on screen: the
// first media packet can still be a moment away.
export type Status = "idle" | "connecting" | "live" | "error";

type EventMap = {
  stream: MediaStream;
  statusChange: Status;
};

type Listener<E extends keyof EventMap> = (payload: EventMap[E]) => void;

const SDP_MIME = "application/sdp";
// Upper bound for ICE gathering before the local description is sent anyway;
// the candidates gathered so far are usually enough to connect.
const ICE_GATHERING_TIMEOUT = 3000;
const MIN_RETRY_DELAY = 1000;

export class Whep {
  private pc?: RTCPeerConnection;
  private stream?: MediaStream;
  // Taken from the Location header of the POST response; the target of the
  // PATCH answer and of the DELETE that ends the session.
  private sessionUrl?: string;
  private status: Status;
  private listeners: { [E in keyof EventMap]: Set<Listener<E>> };
  // Incremented on every connect()/disconnect(). Async work captures the
  // generation it started in and bails if it no longer matches, so an
  // in-flight connect chain cannot mutate a torn-down instance.
  private generation: number;
  private cancelWait?: () => void;

  constructor() {
    this.status = "idle";
    this.generation = 0;
    this.listeners = {
      stream: new Set(),
      statusChange: new Set(),
    };
  }

  async connect(url: string): Promise<void> {
    if (this.pc) return;

    const generation = ++this.generation;

    this.setStatus("connecting");

    try {
      const pc = this.createPeerConnection();

      // WHEP is playback only: request one recvonly transceiver per kind so
      // the offer advertises both media types.
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

      // Abandoned mid-flight (the instance was disconnected or reconnected).
      if (!response || this.isStale(generation)) return;

      const sdp = await response.text();

      if (this.isStale(generation)) return;

      // A "406 Not Acceptable" only counts as a counter-offer when it carries
      // an SDP body; otherwise it is a plain error (spec section 4.3.3).
      const counterOffer = response.status === 406 && this.isSdp(response);

      if (response.status !== 201 && !counterOffer) {
        throw new Error(
          `WHEP POST failed: ${response.status} ${response.statusText}`
        );
      }

      // Both remaining outcomes allocate a WHEP session, so the Location
      // header is mandatory here (spec sections 4.3.1 and 4.3.2). It is needed
      // for the PATCH below and for the DELETE in endSession().
      this.sessionUrl = this.resolveSessionUrl(url, response);

      if (counterOffer) {
        // The endpoint rejected our offer and countered with its own; we owe
        // it an answer over HTTP PATCH.
        await this.answerCounterOffer(generation, pc, sdp);
      } else {
        // The endpoint accepted our offer and replied with an answer.
        await pc.setRemoteDescription({ type: "answer", sdp });
      }
    } catch (err) {
      if (this.isStale(generation)) return;
      console.error(err);
      this.endSession();
      this.setStatus("error");
    }
  }

  disconnect(): void {
    // Invalidate any in-flight async work from the active generation.
    this.generation++;

    this.endSession();
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

  // True if a newer connect() or disconnect() has started since the caller
  // captured this generation, so whatever it is doing is no longer wanted.
  private isStale(generation: number): boolean {
    return this.generation !== generation;
  }

  private createPeerConnection(): RTCPeerConnection {
    // WHEP mandates a bundled, rtcp-muxed session (spec section 4.6.1).
    const pc = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
    this.pc = pc;

    const stream = this.createStreamSink();

    pc.addEventListener("track", ({ track }) => {
      if (pc !== this.pc) return;

      stream.addTrack(track);

      track.addEventListener("ended", () => {
        if (pc !== this.pc) return;

        stream.removeTrack(track);

        // The publisher is gone, so the session is over. End it to leave the
        // instance ready for another connect(); whether to sit and wait for
        // the next broadcast is the consumer's call.
        if (stream.getTracks().length === 0) {
          this.endSession();
          this.setStatus("idle");
        }
      });
    });

    pc.addEventListener("connectionstatechange", () => {
      if (pc !== this.pc) return;

      switch (pc.connectionState) {
        case "connected":
          this.setStatus("live");
          break;
        case "disconnected":
          this.endSession();
          this.setStatus("idle");
          break;
        case "failed":
          this.endSession();
          this.setStatus("error");
          break;
        case "closed":
          this.endSession();
          this.setStatus("idle");
          break;
      }
    });

    return pc;
  }

  private createStreamSink(): MediaStream {
    this.stream = new MediaStream();

    // Consumers attach this stream to their sink (e.g. a <video> element) via
    // the "stream" event. The lib stays DOM-free and just emits the stream.
    this.emit("stream", this.stream);

    return this.stream;
  }

  // Resolves the WHEP session URL from the Location header, which may be
  // relative to the endpoint URL.
  // Note that "Location" is not a CORS-safelisted response header, so on a
  // cross-origin endpoint it reads back as null unless the server sends
  // "Access-Control-Expose-Headers: Location".
  private resolveSessionUrl(url: string, response: Response): string {
    const location = response.headers.get("Location");

    if (!location) {
      throw new Error(
        "WHEP response is missing the Location header. If the endpoint is " +
          "cross-origin, it must send " +
          "'Access-Control-Expose-Headers: Location'."
      );
    }

    return new URL(location, url).toString();
  }

  private isSdp(response: Response): boolean {
    return (
      response.headers.get("Content-Type")?.includes(SDP_MIME) ?? false
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
        headers: { "Content-Type": SDP_MIME },
        body: offer,
      });

      if (this.isStale(generation)) return undefined;

      if (response.status !== 409) return response;

      const retryAfter = this.parseRetryAfter(response);

      if (retryAfter === undefined) {
        throw new Error(
          "WHEP POST failed: 409 Conflict without a usable 'Retry-After' " +
            "header. If the endpoint is cross-origin, it must send " +
            "'Access-Control-Expose-Headers: Retry-After'."
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

  // Completes the offer/answer exchange when the endpoint countered our offer
  // (spec section 4.3.2): apply its offer, then PATCH our answer.
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
      headers: { "Content-Type": SDP_MIME },
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
        if (pc.iceGatheringState === "complete") done();
      };

      const timer = setTimeout(done, ICE_GATHERING_TIMEOUT);

      pc.addEventListener("icegatheringstatechange", onStateChange);
    });
  }

  // Ends the WHEP session: releases it server-side and drops all local state.
  // Every terminal status goes through here, so "the status is not
  // 'connecting' or 'live'" and "no session exists" can never disagree, and a
  // connect() after any of them is never swallowed by the guard on this.pc.
  private endSession(): void {
    if (this.sessionUrl) {
      // Fire-and-forget: the session is gone locally either way. It is often
      // already gone server-side too (the publisher stopping is what ended
      // it), so a 404 here is expected and harmless.
      void fetch(this.sessionUrl, { method: "DELETE", keepalive: true }).catch(
        (err) => console.error(err)
      );
      this.sessionUrl = undefined;
    }

    this.cancelWait?.();

    this.pc?.close();
    this.pc = undefined;

    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = undefined;
  }
}
