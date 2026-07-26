import { StreamProvider } from "./context/StreamProvider";
import { VideoRefsProvider } from "./context/VideoRefsProvider";
import VideoPlayer from "./components/VideoPlayer";

function App() {
  return (
    <StreamProvider>
      <VideoRefsProvider>
        <VideoPlayer />
      </VideoRefsProvider>
    </StreamProvider>
  );
}

export default App;
