import { useEffect, useState } from "react";
import { Mediasoup } from "../lib/mediasoup";
import { StreamContext } from "./streamContext";

// Broadcasts streaming state to all consumers.
export function StreamProvider({ children }) {
  const [stream, setStream] = useState(null);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    const client = new Mediasoup();
    const clearStreamEventListeners = client.on("stream", (stream) => {
      setStream(stream);
    });
    const clearStatusEventListeners = client.on("statusChange", (status) => {
      setStatus(status);
    });

    client.connect(import.meta.env.VITE_SERVER_URL);

    return () => {
      clearStreamEventListeners();
      clearStatusEventListeners();

      client.disconnect();

      setStream(null);
      setStatus("idle");
    };
  }, []);

  const value = { stream, status };

  return (
    <StreamContext.Provider value={value}>
      {children}
    </StreamContext.Provider>
  );
}
