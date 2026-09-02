import { useStreamContext } from "../context/streamContext";
import { useVideoRefs } from "../context/videoRefsContext";
import { usePlaybackGate } from "../context/playbackGateContext";
import PlayerOverlay from "./PlayerOverlay";

export default function PlayerOverlayDesktop() {
  const { status } = useStreamContext();
  const { videoRef } = useVideoRefs();
  const { unlocked, unlock } = usePlaybackGate();

  if (status === "live" && unlocked) return null;

  const startPlayback = () => {
    const video = videoRef.current;

    if (!video) return;

    video.ontimeupdate = null;

    video.muted = false;
    video.play().catch(() => {});

    unlock();
  };

  return <PlayerOverlay onStartPlayback={startPlayback} />;
}
