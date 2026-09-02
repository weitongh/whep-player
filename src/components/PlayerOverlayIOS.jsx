import { useEffect, useRef, useState } from "react";
import { useStreamContext } from "../context/streamContext";
import { useVideoRefs } from "../context/videoRefsContext";
import PlayerOverlay from "./PlayerOverlay";

export default function PlayerOverlayIOS() {
  const { stream, status } = useStreamContext();
  const { videoRef } = useVideoRefs();

  // Hidden while the video is playing in native fullscreen; otherwise the
  // overlay's visibility is derived from whether a live stream exists.
  const [nativeFullscreenActive, setNativeFullscreenActive] = useState(false);
  // Interval that syncs audio while in native iOS fullscreen.
  const pollRef = useRef(null);

  // Keep the audio track off until the video is handed to native fullscreen.
  // VideoContainer already pauses the session on its first frame, but it only
  // mutes the element, and iOS needs the track itself silenced as well.
  useEffect(() => {
    if (status !== "live" || !stream) return;

    const audio = stream.getAudioTracks()[0] ?? null;
    if (audio) audio.enabled = false;
  }, [stream, status]);

  // Clear the native-fullscreen audio poll on unmount.
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const enterFullscreen = () => {
    const video = videoRef.current;
    if (!video?.webkitEnterFullscreen) return;

    // Cancel the pending preview pause first. Otherwise a `timeupdate` landing
    // right after this tap would pause the video on its way into fullscreen.
    video.ontimeupdate = null;

    const audio = stream?.getAudioTracks()[0] ?? null;
    if (audio) audio.enabled = true;

    // Undo the preview mute from inside the tap handler, without awaiting
    // anything in between: Safari only treats playback with sound as permitted
    // when it originates from the gesture itself.
    video.muted = false;
    video.play();
    video.webkitEnterFullscreen();
    setNativeFullscreenActive(true);

    if (pollRef.current) clearInterval(pollRef.current);

    // Native iOS fullscreen controls can pause or resume the video without
    // triggering any JS events, so poll and sync the audio track state until
    // fullscreen mode exits.
    pollRef.current = setInterval(() => {
      const track = stream?.getAudioTracks()[0] ?? null;
      if (video.webkitDisplayingFullscreen) {
        if (track) track.enabled = !video.paused;
      } else {
        clearInterval(pollRef.current);
        pollRef.current = null;
        if (track) track.enabled = false;
        setNativeFullscreenActive(false);
      }
    }, 300);
  };

  // Native fullscreen draws its own UI over everything.
  if (nativeFullscreenActive) return null;

  return <PlayerOverlay onStartPlayback={enterFullscreen} />;
}
