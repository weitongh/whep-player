import { useEffect, useState } from "react";
import { useStreamContext } from "../context/streamContext";
import { useVideoRefs } from "../context/videoRefsContext";

export default function PlayButton() {
  const { stream, status } = useStreamContext();
  const { videoRef } = useVideoRefs();

  const [playing, setPlaying] = useState(false);

  // Keep play state in sync with the real element, covering changes made
  // outside this component (autoplay policies, native controls) and stream
  // reuse across sessions.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncPlayState = () => setPlaying(!video.paused);

    video.addEventListener("play", syncPlayState);
    video.addEventListener("pause", syncPlayState);
    video.addEventListener("playing", syncPlayState);
    video.addEventListener("emptied", syncPlayState);

    syncPlayState();

    return () => {
      video.removeEventListener("play", syncPlayState);
      video.removeEventListener("pause", syncPlayState);
      video.removeEventListener("playing", syncPlayState);
      video.removeEventListener("emptied", syncPlayState);
    };
  }, [videoRef, stream, status]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  return (
    <button
      className="control-btn"
      onClick={togglePlay}
    >
      <span className="tooltip">{playing ? "暂停" : "播放"}</span>
      <svg className="icon" fill="currentColor" viewBox="0 0 24 24">
        {playing ? (
          <path d="M6 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6ZM17 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1Z" />
        ) : (
          <path d="M4.5 3.9c0-1.35 1.4-2.24 2.61-1.66l14.13 6.6a1.85 1.85 0 0 1 0 3.32L7.11 21.76A1.85 1.85 0 0 1 4.5 20.1V3.9Z" />
        )}
      </svg>
    </button>
  );
}
