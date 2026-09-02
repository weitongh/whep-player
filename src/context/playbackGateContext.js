import { createContext, useContext } from "react";

// Browsers block playback with sound until the page has seen a user gesture,
// so the player starts behind a click-to-play gate. `unlocked` records that
// the viewer has taken that gesture.
export const PlaybackGateContext = createContext(null);

export function usePlaybackGate() {
  const ctx = useContext(PlaybackGateContext);

  if (ctx === null) {
    throw new Error("usePlaybackGate must be used within a <PlaybackGateProvider>");
  }

  return ctx;
}
