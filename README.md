# WHEP Player

A browser video player that plays a live stream from a WHEP (WebRTC-HTTP Egress
Protocol) endpoint. I built it to host watch parties with friends, so the UI is
tailored to my own preferences.

To try it, point the player at your own WHEP endpoint:

```sh
npm install
VITE_WHEP_ENDPOINT_URL=<whep-endpoint-url> npm run dev
```

## WHEP client (`src/lib/whep.ts`)

The player core is designed to be client-agnostic: no dependencies, no DOM, no
framework. It implements the mandatory parts of
[draft-ietf-wish-whep-04](https://www.ietf.org/archive/id/draft-ietf-wish-whep-04.html).
You can drop it into any client code, example:

```ts
import { Whep } from "./lib/whep";

const video = document.querySelector("video")!;
const client = new Whep();

// Attach the listeners before calling client.connect().
client.on("stream", (stream) => {
  video.srcObject = stream;
});

client.on("statusChange", (status) => {
  console.log(status); // "idle" | "connecting" | "live" | "error"
});

client.connect("<whep-endpoint-url>");

// Later, to end the session:
// client.disconnect();
```
