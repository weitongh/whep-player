# Screenshare Web Client

A real-time screen sharing web app for hosting watch parties with friends. Runs
against my self-hosted mediasoup server; not intended for general deployment.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run deploy` — deploy to Cloudflare Workers

## Environment

The mediasoup server URL is read from `VITE_SERVER_URL`. Create a `.env` file
at the project root. Update it to point at a different server:

```env
VITE_SERVER_URL=<mediasoup-server-url>
```
