import { useVideoRefs } from "../context/videoRefsContext"
import PlayButtonIOS from "./PlayButtonIOS"
import PlayerControls from "./PlayerControls"
import PlayerOverlay from "./PlayerOverlay"
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
      <PlayerOverlay />
      {isIOS ? <PlayButtonIOS /> : <PlayerControls />}
    </div>
  )
}
