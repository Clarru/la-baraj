# Live multiplayer friends playtest

The small room server runs on Cloudflare Workers with a SQLite-backed Durable Object per invite room. The browser connects using PartySocket. This beta shares player presence, feet positions, facing, animation/activity, scooter state, campfire state, and exclusive seat occupancy. Movement remains client controlled; it does not implement authoritative physics, account authentication, an economy, or anti-cheat.

## Deployed services

- Frontend: https://la-baraj.vercel.app
- Multiplayer: https://la-baraj-world.claumarin336.workers.dev
- Public backend health: https://la-baraj-world.claumarin336.workers.dev/health
- Private source repository: https://github.com/Clarru/la-baraj

Use the full invite URL, including its `?room=` value, for everyone joining the same playtest. Opening the bare frontend URL creates a new random room. The production Worker accepts only the exact `https://la-baraj.vercel.app` browser origin; arbitrary preview domains are not allowed.

The frontend uses Vercel Hobby and the room server uses Cloudflare Workers with SQLite Durable Objects. No paid plan was enabled for this deployment.

## Release workflow

This release repository is an isolated snapshot at `/Users/claumarin/Documents/ChatGPT/multiplayer-game-release`. Parallel game development continues in the original sibling `multiplayer-game` workspace. Copy completed changes into the release repository deliberately, preserving the multiplayer integration, then run the checks before publishing. Changes in the original directory are not automatically live.

Use Node 24 and `npm ci`. The frontend reads `VITE_ROOM_SERVER_URL` at build time; Vercel has it set to the deployed multiplayer host. The Worker entry point is `apps/server/index.ts`; its binding and SQLite migration are in `apps/server/wrangler.jsonc`. Deploy an intentional backend change with `npm run server:deploy`. Credentials stay outside the repository.

Keep one local game server at `http://127.0.0.1:4173/`, as required by `AGENTS.md`. Do not start another backend or frontend listener without coordinating ownership. The deployed socket harness below exercises the remote backend without a local server.

Production frontend deployments use the linked Vercel project `la-baraj`; pushes to `main` are connected through GitHub. Use `vercel deploy --prod` for an explicit release when needed. Keep the Worker origin policy aligned with the actual production frontend alias.

## Room addresses and browser origins

WebSockets use `/parties/world-room/<room-id>`. A room ID must contain 22–80 ASCII letters, digits, underscores, or hyphens. Generate it from cryptographic randomness (for example, 18 random bytes encoded as base64url). Each invite chooses its own Durable Object; the server has no shared public lobby. The invite grants access to everyone holding the URL. Room IDs are not user authentication.

Set `ALLOWED_ORIGINS` in the worker environment to comma-separated, exact frontend origins, including the scheme. For example, `https://your-app.vercel.app`. The check rejects missing, `null`, prefix-match, or unlisted origins. Health checks at `/health` stay public and return `{ "ok": true, "version": 1, "service": "la-baraj-world" }`.

Origin checking limits browser connections; a custom non-browser program can supply its own Origin header. Keep invites within the intended friends group.

## Wire protocol and authority

`packages/shared/protocol.ts` defines version 1. A successful connection immediately receives a `snapshot` containing `selfId`, all current players, the latest `fire` state, and a `seats` map from seat ID to player ID. Send `hello` to set a nickname; send `sync` to request a fresh snapshot. Reconnection receives a new server-generated player ID and a fresh snapshot. Both the public player identity and PartyServer's internal connection identity are generated on the server, regardless of `_pk` or payload IDs supplied by a client.

Send `pose` messages about seven times per second while moving or changing activity; suppress unchanged poses while idle. `pose.position` is the avatar's world-space feet/root location, not its capsule center. A pose includes yaw, animation, activity, `vehicle` (`none` or `scooter`), optional speed, and optional jump phase. All players receive `joined`, `pose`, and `left` messages as peers arrive, update, and disconnect.

Seat requests use `{ "type": "seat", "seatId": "bench-id:seat:0", "requestId": "unique-id" }`; pass `seatId: null` to release. Await the corresponding `seat-result`. A rejection preserves the requester's previous claim. The server sends `seats` snapshots after a successful change or a disconnect, and strips unclaimed seat IDs from client poses. The client uses these authoritative results to update its local seat registry. Claims are atomic within the room and each player can occupy one seat. The server validates seat ID syntax, but does not simulate bench reachability or know the level's full seat catalog.

Campfire messages use `{ "type": "fire", "lit": false }`. Changes persist in Durable Object storage before broadcast, with an increasing revision. Fire state survives empty rooms and worker restarts. Poses, nicknames, rate buckets, and seat claims live in WebSocket attachments via `connection.setState`, allowing PartyServer to restore them through `getConnections` when the object wakes from hibernation. A disconnected player releases its presence and seat; disconnected player poses are not retained as world records.

## Anonymous cabin ownership

Each room has 30 cabin plots, indexed `0` through `29`. An opted-in anonymous owner receives a random unused plot. The server persists its ownership independently of active connections; disconnecting or leaving the room does not free the plot. Returning through the same room invite and browser credential restores the same cabin, while the public player ID changes with each WebSocket connection. Multiple tabs using one credential share that owner's cabin and keep separate player IDs. The server does not resolve simultaneous movement between those tabs.

Before the first home request, the browser generates 32 cryptographically random bytes encoded as a 43-character base64url credential. It persists that credential with a pending-creation flag in room-scoped local storage before sending:

```json
{ "type": "hello", "nickname": "Friend", "requestHome": true, "resumeToken": "<43-character private credential>", "createHome": true }
```

The server serializes allocation and persistence, stores a SHA-256 digest of the credential in the bounded `home-owners-v1` ledger, and acknowledges with `snapshot.home: { index, resumeToken }` only to that connection. Public player presence includes the optional `homeIndex` and never includes the credential. The browser waits for this private snapshot before spawning beside the assigned plot and clears its pending-creation flag after persisting the acknowledgement. A lost acknowledgement can safely retry `createHome: true` with the same saved credential; it resumes the existing plot instead of consuming another one.

Subsequent connections send `requestHome: true` and the saved `resumeToken`, omitting `createHome`. An unknown credential returns `invalid-resume` and closes the connection; the browser must preserve the saved credential and show the error instead of silently creating a different owner. A new owner arriving after all 30 plots are owned receives `homes-full`. Existing owners can still resume in a full room, subject to the separate 30-active-connection limit. Clearing browser storage loses that browser's ability to resume; offline owners' plots remain reserved. The credential is a bearer capability, so copying it shares access to the same anonymous cabin.

Home fields are additive to wire protocol version 1. An old client's nickname-only `hello` remains supported and consumes no permanent plot, allowing the backend to deploy before the frontend. Older hibernated connection attachments have no private home field; they acquire one only after an explicit opted-in `hello`. Client-provided `homeIndex` fields are discarded. The private credential is sent in a WebSocket message, never in invite URLs, query parameters, public diagnostics, or server log messages. Corrupt stored ownership fails closed rather than reallocating occupied plots.

## Bounds and verification

Rooms allow 30 active connections. Incoming JSON packets are limited to 1 KiB. Positions and all numeric/string fields have explicit bounds. The per-connection token buckets allow 20 incoming messages per second with an initial burst of 30, at most 10 pose updates per second with a burst of 3, and 2 interaction messages per second with a burst of 5. Excess pose updates are dropped. Repeated invalid packets or excessive interaction messages close the connection. Rate state survives hibernation.

Run the backend checks:

```sh
npm run server:check
npm run test:protocol
```

The smoke harness also accepts a deployed worker host and an allowed browser origin:

```sh
node apps/server/websocket-smoke.mjs https://worker-host.workers.dev https://frontend-host.vercel.app
```

It opens independent WebSocket sessions, intentionally reuses a client `_pk` to check server identity, and verifies presence, pose delivery, separate room isolation, seat conflict rejection, disconnect cleanup, shared fire, reconnect snapshots, health, origin rejection, and room-ID validation. Home checks cover legacy opt-in, distinct owners' cabins, private credentials, rejected ownership overrides, returning owners, multiple tabs, and rejected unknown resume credentials. It uses the existing `ws` dependency because Node's standard WebSocket constructor cannot set the browser Origin header. Protocol tests also cover malformed packets, active-player and permanent-home capacity, rate limits, storage failures, concurrent allocation, retry idempotency, and reconstruction from hibernated connection state and persisted home ownership.
