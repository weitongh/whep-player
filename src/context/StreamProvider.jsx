import { useEffect, useState } from "react";
import { Mediasoup } from "../lib/mediasoup";
import { StreamContext } from "./streamContext";

// Broadcasts streaming state to all consumers.
export function StreamProvider({ children }) {
  const [stream, setStream] = useState(null);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    const client = new Mediasoup();
    client.on("stream", setStream);
    client.on("statusChange", setStatus);

    client.connect(import.meta.env.VITE_SERVER_URL);

    return () => {
      client.off("stream", setStream);
      client.off("statusChange", setStatus);

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
