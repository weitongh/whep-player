import { useEffect, useState } from "react";
import { useVideoRefs } from "../context/videoRefsContext";

export default function PictureInPictureButton() {
  const { videoRef } = useVideoRefs();

  const [pictureInPictureActive, setPictureInPictureActive] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnter = () => setPictureInPictureActive(true);
    const handleLeave = () => setPictureInPictureActive(false);

    video.addEventListener("enterpictureinpicture", handleEnter);
    video.addEventListener("leavepictureinpicture", handleLeave);

    return () => {
      video.removeEventListener("enterpictureinpicture", handleEnter);
      video.removeEventListener("leavepictureinpicture", handleLeave);
    };
  }, [videoRef]);

  const togglePictureInPicture = () => {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
      return;
    }

    const video = videoRef.current;
    if (video) video.requestPictureInPicture();
  };

  return (
    <button className="control-btn" onClick={togglePictureInPicture}>
      <span className="tooltip">{pictureInPictureActive ? "结束画中画" : "开启画中画"}</span>
      <svg className="icon" fill="currentColor" viewBox="0 0 24 24">
        <g transform={pictureInPictureActive ? "rotate(180 12 12)" : undefined}>
          <path d="M15 2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0V4.41l-4.3 4.3a1 1 0 1 1-1.4-1.42L19.58 3H16a1 1 0 0 1-1-1Z"></path>
          <path d="M5 2a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-6a1 1 0 1 0-2 0v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6a1 1 0 1 0 0-2H5Z"></path>
        </g>
      </svg>
    </button>
  );
}
