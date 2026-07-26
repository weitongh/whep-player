import { useCallback, useEffect, useRef, useState } from "react";
import { useStreamContext } from "../context/streamContext";
import PlayButton from "./PlayButton";
import VolumeButton from "./VolumeButton";
import PictureInPictureButton from "./PictureInPictureButton";
import FullscreenButton from "./FullscreenButton";

const HIDE_DELAY = 4000;

export default function PlayerControls() {
  const { status } = useStreamContext();
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef(null);
  // True while the cursor is over the bottom control bar; blocks auto-hide.
  const overControlsRef = useRef(false);

  const hasStream = status === "live";

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      // Don't hide while hovering the controls.
      if (overControlsRef.current) return;
      setVisible(false);
    }, HIDE_DELAY);
  }, [clearHideTimer]);

  useEffect(() => {
    const showAndScheduleHide = () => {
      setVisible(true);
      scheduleHide();
    };

    const handleMouseLeave = () => {
      clearHideTimer();
      // Cursor left the page: hide immediately.
      setVisible(false);
    };

    document.addEventListener("mousemove", showAndScheduleHide);
    // `mouseleave` on the root element reliably fires when the cursor exits
    // the viewport (unlike on `document`).
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);

    // Start the initial countdown.
    scheduleHide();

    return () => {
      document.removeEventListener("mousemove", showAndScheduleHide);
      document.documentElement.removeEventListener(
        "mouseleave",
        handleMouseLeave
      );
      clearHideTimer();
    };
  }, [scheduleHide, clearHideTimer]);

  // With no live stream the controls are always hidden.
  const effectiveVisible = hasStream && visible;

  const handleControlsEnter = () => {
    overControlsRef.current = true;
    clearHideTimer();
    setVisible(true);
  };

  const handleControlsLeave = () => {
    overControlsRef.current = false;
    scheduleHide();
  };

  return (
    // Backdrop for the controls: a fade gradient that darkens the video so
    // the control bar stays legible. It fades in/out in lockstep with the
    // controls (driven by `effectiveVisible`).
    <div
      className={`absolute inset-0 bg-fade-overlay transition-opacity duration-400 ease-in-out ${
        effectiveVisible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div
        className="absolute bottom-0 left-0 right-0 z-3 flex items-center justify-between px-3 py-2 text-foreground filter-[drop-shadow(0_0_1px_black)]"
        onMouseEnter={handleControlsEnter}
        onMouseLeave={handleControlsLeave}
      >
        <div className="left-control flex items-center gap-3">
          <PlayButton />
          <VolumeButton />
        </div>
        <div className="right-control flex items-center gap-3">
          <PictureInPictureButton />
          <FullscreenButton />
        </div>
      </div>
    </div>
  );
}
