import { useEffect, useState } from "react";
import { useVideoRefs } from "../context/videoRefsContext";

export default function FullscreenButton() {
  const { videoRef, videoPlayerRef } = useVideoRefs();

  const [fullscreenActive, setFullscreenActive] = useState(false);

  // Fullscreen state (fullscreen is requested on the video player element).
  useEffect(() => {
    const videoPlayer = videoPlayerRef.current;
    if (!videoPlayer) return;

    const handleChange = () =>
      setFullscreenActive(Boolean(document.fullscreenElement));

    videoPlayer.addEventListener("fullscreenchange", handleChange);

    return () => {
      videoPlayer.removeEventListener("fullscreenchange", handleChange);
    };
  }, [videoPlayerRef]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }

    const videoPlayer = videoPlayerRef.current;
    if (videoPlayer?.requestFullscreen) {
      videoPlayer.requestFullscreen();
      return;
    }

    // Safari (esp. iOS) lacks the Fullscreen API on arbitrary elements; fall
    // back to native video fullscreen.
    const video = videoRef.current;
    if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
  };

  return (
    <button
      className="control-btn"
      onClick={toggleFullscreen}
    >
      <span className="tooltip tooltip-shift-left translate-x-[-75%]">
        {fullscreenActive ? "退出全屏" : "进入全屏"}
      </span>
      <svg className="icon" fill="currentColor" viewBox="0 0 24 24">
        {fullscreenActive ? (
          <path d="M8 6a2 2 0 0 1-2 2H3a1 1 0 0 0 0 2h3a4 4 0 0 0 4-4V3a1 1 0 0 0-2 0v3ZM8 18a2 2 0 0 0-2-2H3a1 1 0 1 1 0-2h3a4 4 0 0 1 4 4v3a1 1 0 1 1-2 0v-3ZM18 8a2 2 0 0 1-2-2V3a1 1 0 1 0-2 0v3a4 4 0 0 0 4 4h3a1 1 0 1 0 0-2h-3ZM16 18c0-1.1.9-2 2-2h3a1 1 0 1 0 0-2h-3a4 4 0 0 0-4 4v3a1 1 0 1 0 2 0v-3Z"></path>
        ) : (
          <path d="M4 6c0-1.1.9-2 2-2h3a1 1 0 0 0 0-2H6a4 4 0 0 0-4 4v3a1 1 0 0 0 2 0V6ZM4 18c0 1.1.9 2 2 2h3a1 1 0 1 1 0 2H6a4 4 0 0 1-4-4v-3a1 1 0 1 1 2 0v3ZM18 4a2 2 0 0 1 2 2v3a1 1 0 1 0 2 0V6a4 4 0 0 0-4-4h-3a1 1 0 1 0 0 2h3ZM20 18a2 2 0 0 1-2 2h-3a1 1 0 1 0 0 2h3a4 4 0 0 0 4-4v-3a1 1 0 1 0-2 0v3Z"></path>
        )}
      </svg>
    </button>
  );
}
