import { useVideoRefs } from "../context/videoRefsContext"
import PlayerControls from "./PlayerControls"
import PlayerOverlayDesktop from "./PlayerOverlayDesktop"
import PlayerOverlayIOS from "./PlayerOverlayIOS"
import VideoContainer from "./VideoContainer"

export default function VideoPlayer() {
  const { videoPlayerRef } = useVideoRefs();
  const isIOS = /iPhone|iPad/i.test(navigator.userAgent);

  return (
    <div
      ref={videoPlayerRef}
      className="relative flex flex-1 items-center justify-center bg-background"
    >
      <VideoContainer />
      {isIOS ? (
        <PlayerOverlayIOS />
      ) : (
        <>
          <PlayerOverlayDesktop />
          <PlayerControls />
        </>
      )}
    </div>
  )
}
