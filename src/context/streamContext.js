import { createContext, useContext } from "react";

export const StreamContext = createContext(null);

export function useStreamContext() {
  const ctx = useContext(StreamContext);

  if (ctx === null) {
    throw new Error("useStreamContext must be used within a <StreamProvider>");
  }

  return ctx;
}
