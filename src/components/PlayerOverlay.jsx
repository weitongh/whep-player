import { useStreamContext } from "../context/streamContext";

// The layer covering the video before playback starts: a spinner while there is
// nothing to play, otherwise a tap target that runs `onStartPlayback`. The whole
// player area is clickable; the badge is just what the viewer aims at.
export default function PlayerOverlay({ onStartPlayback }) {
  const { stream } = useStreamContext();

  const waiting = !stream;

  return (
    <div
      className={`absolute inset-0 z-2 flex items-center justify-center ${
        waiting ? "pointer-events-none" : "cursor-pointer"
      }`}
      onClick={waiting ? undefined : onStartPlayback}
    >
      {waiting ? (
        <div
          className="size-[clamp(4rem,24vw,6.5rem)] animate-spin rounded-full
          border-[clamp(4px,1.7vw,7px)] border-muted/30 border-t-foreground"
        />
      ) : (
        <div
          className="flex size-[clamp(4rem,24vw,6.5rem)] items-center justify-center
          rounded-full bg-black/50 text-foreground"
        >
          <svg className="size-1/2" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4.5 3.9c0-1.35 1.4-2.24 2.61-1.66l14.13 6.6a1.85 1.85 0 0 1 0 3.32L7.11 21.76A1.85 1.85 0 0 1 4.5 20.1V3.9Z" />
          </svg>
        </div>
      )}
    </div>
  );
}
