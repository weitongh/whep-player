import { useEffect, useState } from "react";
import { StreamContext } from "./streamContext";
import { Whep } from "../lib/whep";

const RECONNECT_DELAY = 5000;

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

      delay = RECONNECT_DELAY;
    };

    const onStatusChange = (status) => {
      setStatus(status);

      if (status === "live") {
        delay = 0;
        return;
      }

      if (status === "connecting") return;

      connect();
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
