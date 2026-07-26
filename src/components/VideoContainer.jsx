import { useEffect } from "react";
import { useStreamContext } from "../context/streamContext";
import { useVideoRefs } from "../context/videoRefsContext";

export default function VideoContainer() {
  const { stream, status } = useStreamContext();
  const { videoRef } = useVideoRefs();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (status === "live") {
      // Attach the stream and resume playback whenever a session goes live. The
      // service reuses the same MediaStream object across sessions, so a user
      // pause from a previous stream would otherwise persist on the reused
      // <video> element and leave the video paused (and the controls desynced).
      video.srcObject = stream;
      video.play().catch(() => {});
    } else {
      // When the session ends the service removes the tracks but keeps the same
      // MediaStream attached, so the element freezes on its last decoded frame.
      // Detach the source to clear that stale frame back to a blank element.
      video.srcObject = null;
    }
  }, [status, stream, videoRef]);

  return (
    <div className="absolute inset-0">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="block h-full w-full object-contain"
      ></video>
    </div>
  );
}
