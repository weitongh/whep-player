import { createContext, useContext } from "react";

// Context object + consumer hook live here (non-component exports) so the
// provider file can export only a component, keeping React Fast Refresh happy.
//
// Shares the two video DOM refs (the <video> element and its fullscreen
// player wrapper) so button components can own their own media logic while
// still targeting the single shared element.
export const VideoRefsContext = createContext(null);

export function useVideoRefs() {
  const ctx = useContext(VideoRefsContext);

  if (ctx === null) {
    throw new Error("useVideoRefs must be used within a <VideoRefsProvider>");
  }

  return ctx;
}
