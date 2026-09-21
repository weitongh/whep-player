import { useEffect, useState } from "react";
import { StreamContext } from "./streamContext";
import { Whep } from "../lib/whep";
import { logger } from "../lib/logger";

const RECONNECT_DELAY = 5000;

// Broadcasts streaming state to all consumers.
export function StreamProvider({ children }) {
  const [stream, setStream] = useState(null);

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

    const onCanPlay = (stream) => {
      delay = 0;

      setStream(stream);

      logger.info("Session connected");
    };

    const onEnded = () => {
      setStream(null);

      connect();

      logger.info("Session ended");
    };

    const onError = (err) => {
      onEnded();

      logger.error("Session failed", err);
    };

    client.on("canplay", onCanPlay);
    client.on("ended", onEnded);
    client.on("error", onError);

    connect();

    return () => {
      clearTimeout(timer);

      client.off("canplay", onCanPlay);
      client.off("ended", onEnded);
      client.off("error", onError);

      client.disconnect();
    };
  }, []);

  return (
    <StreamContext.Provider value={{ stream }}>
      {children}
    </StreamContext.Provider>
  );
}
