# WHEP Player

A browser video player that plays a live stream from a WHEP (WebRTC-HTTP Egress
Protocol) endpoint. I built it to host watch parties with friends, so its UI
and behavior are tailored to my own preferences.

To try it, point the player at your own WHEP endpoint:

```sh
VITE_WHEP_ENDPOINT_URL=<whep-endpoint-url> npm run dev
```

## WHEP client (`src/lib/whep.ts`)

The WHEP client is designed to be a standalone, self-contained module: it has
no dependencies and never touches the DOM. It implements the mandatory parts of
[draft-ietf-wish-whep-04](https://www.ietf.org/archive/id/draft-ietf-wish-whep-04.html).
You can drop it into any codebase, for example:

```ts
import { Whep } from "./lib/whep";

const video = document.querySelector("video")!;
const client = new Whep();

client.on("canplay", (stream) => {
  video.srcObject = stream;
});

// The session ended because streaming has stopped or the connection dropped.
client.on("ended", () => {
  video.srcObject = null;
});

// The session failed due to an error.
client.on("error", (err) => {
  video.srcObject = null;
  console.error(err);
});

client.connect("<whep-endpoint-url>");

// Later, to end the session:
// client.disconnect();
```
