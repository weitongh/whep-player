import { useEffect, useRef, useState } from "react";
import { useStreamContext } from "../context/streamContext";
import { useVideoRefs } from "../context/videoRefsContext";

export default function VolumeButton() {
  const { stream } = useStreamContext();
  const { videoRef } = useVideoRefs();

  const [volume, setVolumeState] = useState(0);
  const [muted, setMuted] = useState(true);
  // Remembers the last audible volume so unmuting can restore it.
  const lastVolumeRef = useRef(1);

  // Keep volume/mute state in sync with the real element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncVolume = () => {
      setVolumeState(video.volume);
      setMuted(video.muted);
      if (!video.muted && video.volume > 0) {
        lastVolumeRef.current = video.volume;
      }
    };

    syncVolume();
    video.addEventListener("volumechange", syncVolume);

    return () => {
      video.removeEventListener("volumechange", syncVolume);
    };
  }, [videoRef, stream]);

  const setVolume = (value) => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = value;
    video.muted = value === 0;
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.muted || video.volume === 0) {
      const restore = lastVolumeRef.current > 0 ? lastVolumeRef.current : 1;
      video.muted = false;
      video.volume = restore;
    } else {
      video.muted = true;
    }
  };

  const handleSliderChange = (e) => {
    setVolume(Number(e.target.value));
  };

  const isMuted = muted || volume === 0;
  const isLow = !isMuted && volume < 0.5;
  const sliderValue = muted ? 0 : volume;

  return (
    <div className="group relative inline-flex items-center">
      <button
        className="control-btn disabled:cursor-not-allowed disabled:text-muted disabled:opacity-70"
        onClick={toggleMute}
      >
        <svg className="icon" fill="currentColor" viewBox="0 0 24 24">
          {isMuted ? (
            <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM22.7 8.3a1 1 0 0 0-1.4 0L19 10.58l-2.3-2.3a1 1 0 1 0-1.4 1.42L17.58 12l-2.3 2.3a1 1 0 0 0 1.42 1.4L19 13.42l2.3 2.3a1 1 0 0 0 1.4-1.42L20.42 12l2.3-2.3a1 1 0 0 0 0-1.4Z" />
          ) : isLow ? (
            <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.18 15.36c-.55.35-1.18-.12-1.18-.78v-.27c0-.36.2-.67.45-.93a2 2 0 0 0 0-2.76c-.24-.26-.45-.57-.45-.93v-.27c0-.66.63-1.13 1.18-.78a4 4 0 0 1 0 6.72Z" />
          ) : (
            <>
              <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5Z" />
              <path d="M15.16 16.51c-.57.28-1.16-.2-1.16-.83v-.14c0-.43.28-.8.63-1.02a3 3 0 0 0 0-5.04c-.35-.23-.63-.6-.63-1.02v-.14c0-.63.59-1.1 1.16-.83a5 5 0 0 1 0 9.02Z" />
            </>
          )}
        </svg>
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={sliderValue}
        onChange={handleSliderChange}
        style={{ "--volume-fill": `${sliderValue * 100}%` }}
        className="volume-slider ml-1 w-0 opacity-0 transition-all duration-200 ease-in-out group-hover:w-18.75 group-hover:opacity-100"
      />
    </div>
  );
}
