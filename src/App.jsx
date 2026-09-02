import { StreamProvider } from "./context/StreamProvider";
import { VideoRefsProvider } from "./context/VideoRefsProvider";
import { PlaybackGateProvider } from "./context/PlaybackGateProvider";
import VideoPlayer from "./components/VideoPlayer";

function App() {
  return (
    <StreamProvider>
      <VideoRefsProvider>
        <PlaybackGateProvider>
          <VideoPlayer />
        </PlaybackGateProvider>
      </VideoRefsProvider>
    </StreamProvider>
  );
}

export default App;
