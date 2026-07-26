import { useEffect, useRef, useState } from "react";
import { useStreamContext } from "../context/streamContext";
import { useVideoRefs } from "../context/videoRefsContext";

export default function PlayButtonIOS() {
  const { stream, status } = useStreamContext();
  const { videoRef } = useVideoRefs();

  // Hidden while the video is playing in native fullscreen; otherwise the
  // button's visibility is derived from whether a live stream exists.
  const [nativeFullscreenActive, setNativeFullscreenActive] = useState(false);
  // Interval that syncs audio while in native iOS fullscreen.
  const pollRef = useRef(null);

  const visible = status === "live" && !!stream && !nativeFullscreenActive;

  // Start each live session paused on the first frame (browsers block audio
  // until a user gesture, so keep video/audio consistent).
  useEffect(() => {
    if (status !== "live" || !stream) return;

    const video = videoRef.current;
    if (!video) return;

    const onFirstFrame = () => {
      video.ontimeupdate = null;
      video.pause();
      const audio = stream.getAudioTracks()[0] ?? null;
      if (audio) audio.enabled = false;
    };

    video.ontimeupdate = onFirstFrame;

    return () => {
      video.ontimeupdate = null;
    };
  }, [videoRef, stream, status]);

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

    video.play();
    video.webkitEnterFullscreen();
    setNativeFullscreenActive(true);

    if (pollRef.current) clearInterval(pollRef.current);

    // Native iOS fullscreen controls can pause or resume the video without
    // triggering any JS events, so poll and sync the audio track state until
    // fullscreen mode exits.
    pollRef.current = setInterval(() => {
      const audio = stream?.getAudioTracks()[0] ?? null;
      if (video.webkitDisplayingFullscreen) {
        if (audio) audio.enabled = !video.paused;
      } else {
        clearInterval(pollRef.current);
        pollRef.current = null;
        if (audio) audio.enabled = false;
        setNativeFullscreenActive(false);
      }
    }, 300);
  };

  return (
    <div
      className={`absolute left-1/2 top-1/2 z-2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/50 ${
        visible ? "" : "hidden"
      }`}
      onClick={enterFullscreen}
    >
      <svg className="h-12 w-12 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path d="M4.5 3.9c0-1.35 1.4-2.24 2.61-1.66l14.13 6.6a1.85 1.85 0 0 1 0 3.32L7.11 21.76A1.85 1.85 0 0 1 4.5 20.1V3.9Z" />
      </svg>
    </div>
  );
}
