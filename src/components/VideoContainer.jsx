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
      // Attach the session's stream and start playback explicitly: attaching a
      // source pauses the element, and its autoplay flag is spent once it has
      // played, so every session after the first would sit paused (with the
      // controls desynced) without this.
      video.srcObject = stream;
      video.play().catch(() => {});
    } else {
      // The session is over and its stream is stopped, but the element holds on
      // to its last decoded frame. Detach the source to clear that stale frame
      // back to a blank element.
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
