# Cloud Emulator integration prototype

Early prototype for integrating the [Roku Cloud Emulator](https://developer.roku.com/cloud-emulator) into the extension. Roku has granted early access to the web version and will provide an API and an API key; this code was reverse-engineered from the web app's network traffic so we have something to build on while we wait. Nothing here has been exercised against the live service yet.

## Architecture

The web app talks to a backend-for-frontend (BFF) at `https://developer.roku.com/cloud-emulator-bff`. Emulator instances run on a separate host (`device.rce.roku.com`), but all client traffic is proxied through the BFF; the instance host sits behind a service-mesh authorization policy and is not reachable directly. Everything here targets the BFF.

Two gates front the service:
- A bot-protection layer (CloudFront + PerimeterX) that rejects requests without a browser-like `User-Agent`.
- Session auth. The web app uses a session cookie. We assume Roku will issue an API key; that assumption is isolated to `RokuCloudEmulatorClient.buildRequestHeaders` (currently a bearer token) so the real scheme is a one-line change.

## What is implemented

All under `src/cloudEmulator/`:

- **`RokuCloudEmulatorClient`** - HTTP client. `getDevices()` hits the device poll endpoint (the one endpoint whose shape is confirmed against the live service). `startDevice`/`stopDevice` are provisional: the web app performs these through per-build Next.js server actions, which are not viable for a stable client, so these assume a REST equivalent that must be confirmed. Also centralizes auth for the socket channels in `buildSocketIoOptions`.
- **`RokuCloudEmulatorLogStream`** - the BrightScript console log (the Cloud Emulator equivalent of telnet 8085) over a WebSocket at `/cloud-emulator-bff/devices/{id}/log`. Emits console text as `output` and JSON control frames as `control`.
- **`RokuCloudEmulatorRemote`** - ECP remote over socket.io at path `/cloud-emulator-bff/io/`. Emits `ecp-init`, then sends input as `ecp` events with a verb (`keypress`, `keydown`, `keyup`) and an ECP key. It accepts the same ECP key strings the extension already sends to physical devices (`Home`, `Up`, `Select`, `Rev`, `InstantReplay`, `Lit_<char>`), so it can back the existing remote commands by swapping only the transport.
- **`RokuCloudEmulatorVideoStream`** - WebRTC video signaling over the same socket, following the Janus streaming handshake: `watch`, receive `offer` (which carries the SDP plus time-limited TURN ICE servers), answer with `start`, `trickle` local candidates, then `trickle-complete`, and receive `started`. WebRTC itself is not implemented here; a peer-connection factory is injected so the same signaling runs in a VS Code webview (browser `RTCPeerConnection`), in Node (a node-webrtc implementation), or against a test fake.
- **`prototype.ts`** - a manual runner (not part of the extension runtime or the test suite) for exercising the client against the live service once an API key is available.

## Running the prototype

```
ROKU_RCE_API_KEY=<key> npx ts-node src/cloudEmulator/prototype.ts
```

Optional environment variables:
- `ROKU_RCE_DEVICE_ID` act on a device (stream logs, send remote input, or open video)
- `ROKU_RCE_REMOTE_KEYS` comma-separated ECP keys to tap, for example `Home,Down,Down,Select`
- `ROKU_RCE_VIDEO=1` negotiate the video stream (needs a Node WebRTC lib: `npm install --no-save @roamhq/wrtc`)
- `ROKU_RCE_BASE_URL` override the service origin

## Verification

Unit tests cover the non-network logic for the client, remote, and video signaling (auth headers, response parsing, ECP payload shapes and hold/release ordering, and the full offer/answer/trickle/started handshake driven by fakes). `tsc` and ESLint are clean. A runtime check confirmed the `ws` and `socket.io-client` imports construct and wire events. The live-service behavior is untested pending the API key.

## Open questions for Roku

- API key for non-browser clients, and how it is presented (header, socket.io auth payload, query token).
- Stable REST endpoints for start/stop/create/snapshot, to replace the per-build server actions.
- Socket auth for a webview: browsers and webviews cannot set handshake headers, so the video viewer needs the key via the socket.io `auth` payload or a query token. `buildSocketIoOptions` already sends both a header and an `auth` payload; the accepted form needs confirming.
- Access to the BrightScript debug protocol for a running instance (needed for roku-debug).

## Next steps

- Wire the remote into the extension's existing remote-control commands, routing to the cloud or a physical device based on the active device.
- Surface cloud devices in the Devices view via the poll endpoint.
- Build the webview that renders the video track and drives the remote.
