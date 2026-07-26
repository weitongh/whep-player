import { useRef } from "react";
import { VideoRefsContext } from "./videoRefsContext";

// Shares the two video DOM refs so consumer components can own their own
// media logic while all targeting the single shared <video> element:
//   - videoRef:       the <video> element itself (bound by VideoContainer)
//   - videoPlayerRef: the wrapper used for element fullscreen (bound by VideoPlayer)
export function VideoRefsProvider({ children }) {
  const videoRef = useRef(null);
  const videoPlayerRef = useRef(null);

  const value = { videoRef, videoPlayerRef };

  return (
    <VideoRefsContext.Provider value={value}>
      {children}
    </VideoRefsContext.Provider>
  );
}
