import { useEffect, useState } from "react";
import { StreamContext } from "./streamContext";
import { Whep } from "../lib/whep";

// The WHEP client never retries a session on its own, so reconnecting is the
// player's job: a session that ends (the broadcast stopped) or fails is
// followed by a fresh one, which parks in the client's own "409 Conflict" loop
// until the next broadcast starts.
// The delay doubles on every consecutive attempt that does not go live and
// resets to zero once one does, so the first attempt and the one right after a
// broadcast ends are immediate, while an endpoint that is down or
// misconfigured is backed off instead of hammered.
const MIN_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;

// Broadcasts streaming state to all consumers.
export function StreamProvider({ children }) {
  const [stream, setStream] = useState(null);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    const client = new Whep();

    let timer;
    let delay = 0;

    const connect = () => {
      clearTimeout(timer);

      timer = setTimeout(
        () => client.connect(import.meta.env.VITE_WHEP_ENDPOINT_URL),
        delay
      );

      delay = Math.min(
        Math.max(delay * 2, MIN_RECONNECT_DELAY),
        MAX_RECONNECT_DELAY
      );
    };

    const onStatusChange = (next) => {
      setStatus(next);

      // "connecting" is an attempt already in flight and "live" is a healthy
      // session; anything else means there is no session, so start another one
      // to keep the player waiting for the upcoming stream.
      if (next === "live") delay = 0;
      else if (next !== "connecting") connect();
    };

    client.on("stream", setStream);
    client.on("statusChange", onStatusChange);

    connect();

    return () => {
      clearTimeout(timer);

      // Detach before disconnecting, so the "idle" it emits cannot schedule a
      // reconnect on the way out.
      client.off("stream", setStream);
      client.off("statusChange", onStatusChange);

      client.disconnect();
    };
  }, []);

  const value = { stream, status };

  return (
    <StreamContext.Provider value={value}>
      {children}
    </StreamContext.Provider>
  );
}
