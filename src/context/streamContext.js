import { createContext, useContext } from "react";

// Context object + consumer hook live here (non-component exports) so the
// provider file can export only a component, keeping React Fast Refresh happy.
export const StreamContext = createContext(null);

export function useStreamContext() {
  const ctx = useContext(StreamContext);

  if (ctx === null) {
    throw new Error("useStreamContext must be used within a <StreamProvider>");
  }

  return ctx;
}
