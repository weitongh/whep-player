import { useState } from "react";
import { PlaybackGateContext } from "./playbackGateContext";

// Tracks whether the viewer has clicked to start playback.
export function PlaybackGateProvider({ children }) {
  const [unlocked, setUnlocked] = useState(false);

  const unlock = () => setUnlocked(true);

  const value = { unlocked, unlock };

  return (
    <PlaybackGateContext.Provider value={value}>
      {children}
    </PlaybackGateContext.Provider>
  );
}
