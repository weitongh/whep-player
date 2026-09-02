import { useEffect } from "react";
import { useStreamContext } from "../context/streamContext";
import { useVideoRefs } from "../context/videoRefsContext";
import { usePlaybackGate } from "../context/playbackGateContext";

export default function VideoContainer() {
  const { stream, status } = useStreamContext();
  const { videoRef } = useVideoRefs();
  const { unlocked } = usePlaybackGate();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (status !== "live") {
      // The session is over and its stream is stopped, but the element holds on
      // to its last decoded frame. Detach the source to clear that stale frame
      // back to a blank element.
      video.srcObject = null;
      return;
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    if (unlocked) {
      // The viewer already clicked to start, which leaves the document with
      // sticky user activation, so playback with sound is allowed from here.
      video.muted = false;
      video.play().catch(() => {});
      return;
    }

    // Still gated. Playing muted is always permitted, so run just far enough to
    // decode a frame and then pause on it, giving the gate a real preview to
    // sit behind instead of a blank element.
    video.muted = true;
    video.play().catch(() => {});

    video.ontimeupdate = () => {
      video.ontimeupdate = null;
      video.pause();
    };

    return () => {
      video.ontimeupdate = null;
    };
  }, [status, stream, unlocked, videoRef]);

  return (
    <div className="absolute inset-0">
      <video
        ref={videoRef}
        playsInline
        className="block h-full w-full object-contain"
      ></video>
    </div>
  );
}
