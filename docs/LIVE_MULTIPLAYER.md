# Live multiplayer friends playtest

The small room server runs on Cloudflare Workers with a SQLite-backed Durable Object per invite room. The browser connects using PartySocket. This beta shares player presence, feet positions, facing, animation/activity, scooter state, campfire state, and exclusive seat occupancy. Movement remains client controlled; it does not implement authoritative physics, account authentication, an economy, or anti-cheat.

## Backend development

Use Node 24 and install the repository dependencies. Start the worker from the repository root:

```sh
npm run server:dev
```

The default address is `http://127.0.0.1:8787`. Configure the frontend's multiplayer host as described in its environment example. The backend accepts the local Vite origins on ports 5173 and 4173 by default.

The worker entry point is `apps/server/index.ts`; its binding and SQLite migration are in `apps/server/wrangler.jsonc`. No account ID or credentials belong in these source files. Deployment is a separate operator action, using `npm run server:deploy` after selecting the intended Cloudflare account.

The checked-in compatibility date is `2026-10-28`. If an older local Wrangler runtime rejects that date, upgrade Wrangler to the version in the lockfile. An older runtime used during initial verification supported only `2026-05-03`; that one was tested with the explicit local CLI override `--compatibility-date 2026-05-03`.

## Room addresses and browser origins

WebSockets use `/parties/world-room/<room-id>`. A room ID must contain 22–80 ASCII letters, digits, underscores, or hyphens. Generate it from cryptographic randomness (for example, 18 random bytes encoded as base64url). Each invite chooses its own Durable Object; the server has no shared public lobby. The invite grants access to everyone holding the URL. Room IDs are not user authentication.

Set `ALLOWED_ORIGINS` in the worker environment to comma-separated, exact frontend origins, including the scheme. For example, `https://your-app.vercel.app`. The check rejects missing, `null`, prefix-match, or unlisted origins. Health checks at `/health` stay public and return `{ "ok": true, "version": 1, "service": "la-baraj-world" }`.

Origin checking limits browser connections; a custom non-browser program can supply its own Origin header. Keep invites within the intended friends group.

## Wire protocol and authority

`packages/shared/protocol.ts` defines version 1. A successful connection immediately receives a `snapshot` containing `selfId`, all current players, the latest `fire` state, and a `seats` map from seat ID to player ID. Send `hello` to set a nickname; send `sync` to request a fresh snapshot. Reconnection receives a new server-generated player ID and a fresh snapshot. Both the public player identity and PartyServer's internal connection identity are generated on the server, regardless of `_pk` or payload IDs supplied by a client.

Send `pose` messages about seven times per second while moving or changing activity; suppress unchanged poses while idle. `pose.position` is the avatar's world-space feet/root location, not its capsule center. A pose includes yaw, animation, activity, `vehicle` (`none` or `scooter`), optional speed, and optional jump phase. All players receive `joined`, `pose`, and `left` messages as peers arrive, update, and disconnect.

Seat requests use `{ "type": "seat", "seatId": "bench-id:seat:0", "requestId": "unique-id" }`; pass `seatId: null` to release. Await the corresponding `seat-result`. A rejection preserves the requester's previous claim. The server sends `seats` snapshots after a successful change or a disconnect, and strips unclaimed seat IDs from client poses. The client uses these authoritative results to update its local seat registry. Claims are atomic within the room and each player can occupy one seat. The server validates seat ID syntax, but does not simulate bench reachability or know the level's full seat catalog.

Campfire messages use `{ "type": "fire", "lit": false }`. Changes persist in Durable Object storage before broadcast, with an increasing revision. Fire state survives empty rooms and worker restarts. Poses, nicknames, rate buckets, and seat claims live in WebSocket attachments via `connection.setState`, allowing PartyServer to restore them through `getConnections` when the object wakes from hibernation. A disconnected player releases its presence and seat; disconnected player poses are not retained as world records.

## Bounds and verification

Rooms allow 30 active connections. Incoming JSON packets are limited to 1 KiB. Positions and all numeric/string fields have explicit bounds. The per-connection token buckets allow 20 incoming messages per second with an initial burst of 30, at most 10 pose updates per second with a burst of 3, and 2 interaction messages per second with a burst of 5. Excess pose updates are dropped. Repeated invalid packets or excessive interaction messages close the connection. Rate state survives hibernation.

Run the backend checks and local WebSocket smoke test:

```sh
npm run server:check
npm run test:protocol
node apps/server/websocket-smoke.mjs
```

The smoke harness also accepts a deployed worker host and an allowed browser origin:

```sh
node apps/server/websocket-smoke.mjs https://worker-host.workers.dev https://frontend-host.vercel.app
```

It opens independent WebSocket sessions, intentionally reuses a client `_pk` to check server identity, and verifies presence, pose delivery, separate room isolation, seat conflict rejection, disconnect cleanup, shared fire, reconnect snapshots, health, origin rejection, and room-ID validation. It uses the existing `ws` dependency because Node's standard WebSocket constructor cannot set the browser Origin header. Protocol tests also cover malformed packets, capacity, rate limits, storage failures, and reconstruction from hibernated connection state.
