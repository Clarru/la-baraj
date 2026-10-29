# Live multiplayer friends playtest

The small world server runs on Cloudflare Workers with one SQLite-backed Durable Object for the shared world. The browser connects using PartySocket. This beta shares player presence, feet positions, facing, animation/activity, scooter state, campfire state, and exclusive seat occupancy. Movement remains client controlled; it does not implement authoritative physics, account authentication, an economy, or anti-cheat.

## Deployed services

- Frontend: https://la-baraj.vercel.app
- Multiplayer: https://la-baraj-world.claumarin336.workers.dev
- Public backend health: https://la-baraj-world.claumarin336.workers.dev/health
- Private source repository: https://github.com/Clarru/la-baraj

Open or share `https://la-baraj.vercel.app`. Everyone joins the same world, including people following older links containing a `?room=` value. The production Worker accepts only the exact `https://la-baraj.vercel.app` browser origin; arbitrary preview domains are not allowed.

The frontend uses Vercel Hobby and the room server uses Cloudflare Workers with SQLite Durable Objects. No paid plan was enabled for this deployment.

## Release workflow

This release repository is an isolated snapshot at `~/Documents/ChatGPT/multiplayer-game-release`. Parallel game development continues in the original sibling `multiplayer-game` workspace. Copy completed changes into the release repository deliberately, preserving the multiplayer integration, then run the checks before publishing. Changes in the original directory are not automatically live.

Use Node 24 and `npm ci`. The frontend reads `VITE_ROOM_SERVER_URL` at build time; Vercel has it set to the deployed multiplayer host. The Worker entry point is `apps/server/index.ts`; its binding and SQLite migration are in `apps/server/wrangler.jsonc`. Deploy an intentional backend change with `npm run server:deploy`. Credentials stay outside the repository.

Keep one local game server at `http://127.0.0.1:4173/`, as required by `AGENTS.md`. Do not start another backend or frontend listener without coordinating ownership. The deployed socket harness below exercises the remote backend without a local server.

Production frontend deployments use the linked Vercel project `la-baraj`; pushes to `main` are connected through GitHub. Use `vercel deploy --prod` for an explicit release when needed. Keep the Worker origin policy aligned with the actual production frontend alias.

## Shared-world routing and browser origins

`CANONICAL_WORLD_ID` in `packages/shared/protocol.ts` is `27f6361b353f4b5db885fd37fac89eda`. The Worker routes `/parties/world-room/<room-id>` to that existing Durable Object for every accepted path, preserving its fire state and anonymous cabin ownership. Legacy path IDs still require 22–80 ASCII letters, digits, underscores, or hyphens, but cannot select or create another world. The world ID is a routing identifier, not an access credential.

Set `ALLOWED_ORIGINS` in the worker environment to comma-separated, exact frontend origins, including the scheme. For example, `https://your-app.vercel.app`. The check rejects missing, `null`, prefix-match, or unlisted origins. Health checks at `/health` stay public and return `{ "ok": true, "version": 1, "service": "la-baraj-world", "worldId": "27f6361b353f4b5db885fd37fac89eda" }`.

Origin checking limits browser connections; a custom non-browser program can supply its own Origin header.

Previously created noncanonical Durable Objects remain archived in storage and are no longer routed. If an old object wakes with open sockets, it closes those sockets with code `1012`; PartySocket reconnects through the canonical route using its normal retry delay. The canonical object keeps its sockets. Retirement uses no repeating alarms or timers and performs no reads or writes to archived world state.

Deploy the backend before the frontend, then publish the updated frontend promptly. Existing noncanonical tabs may require a refresh: their saved cabin credential belongs to the archived object and cannot resume a canonical cabin. Preserve the browser's credential under the canonical world's existing local-storage key; do not replace it with a credential from an old alias. The canonical ledger keeps its `home-owners-v1` key and version 1 schema, and the original cabin indices retain their owners as additional plots become available.

## Wire protocol and authority

`packages/shared/protocol.ts` defines version 1. A successful connection immediately receives a `snapshot` containing `selfId`, all current players, the latest `fire` state, and a `seats` map from seat ID to player ID. Send `hello` to set a nickname; send `sync` to request a fresh snapshot. Reconnection receives a new server-generated player ID and a fresh snapshot. Both the public player identity and PartyServer's internal connection identity are generated on the server, regardless of `_pk` or payload IDs supplied by a client.

Send `pose` messages about seven times per second while moving or changing activity; suppress unchanged poses while idle. `pose.position` is the avatar's world-space feet/root location, not its capsule center. A pose includes yaw, animation, activity, `vehicle` (`none` or `scooter`), optional speed, and optional jump phase. All players receive `joined`, `pose`, and `left` messages as peers arrive, update, and disconnect.

Seat requests use `{ "type": "seat", "seatId": "bench-id:seat:0", "requestId": "unique-id" }`; pass `seatId: null` to release. Await the corresponding `seat-result`. A rejection preserves the requester's previous claim. The server sends `seats` snapshots after a successful change or a disconnect, and strips unclaimed seat IDs from client poses. The client uses these authoritative results to update its local seat registry. Claims are atomic within the room and each player can occupy one seat. The server validates seat ID syntax, but does not simulate bench reachability or know the level's full seat catalog.

Campfire messages use `{ "type": "fire", "lit": false }`. Changes persist in Durable Object storage before broadcast, with an increasing revision. Fire state survives empty rooms and worker restarts. Poses, nicknames, rate buckets, and seat claims live in WebSocket attachments via `connection.setState`, allowing PartyServer to restore them through `getConnections` when the object wakes from hibernation. A disconnected player releases its presence and seat; disconnected player poses are not retained as world records.

## Anonymous cabin ownership

An opted-in anonymous owner receives a random unused cabin plot. The server persists its ownership independently of active connections; disconnecting or leaving the world does not free the plot. Returning through the bare frontend URL with the same browser credential restores the same cabin, while the public player ID changes with each WebSocket connection. Multiple tabs using one credential share that owner's cabin and keep separate player IDs. The server does not resolve simultaneous movement between those tabs.

Before the first home request, the browser generates 32 cryptographically random bytes encoded as a 43-character base64url credential. It persists that credential with a pending-creation flag under the canonical world's local-storage key before sending:

```json
{ "type": "hello", "nickname": "Friend", "requestHome": true, "resumeToken": "<43-character private credential>", "createHome": true }
```

The server serializes allocation and persistence, stores a SHA-256 digest of the credential in the bounded `home-owners-v1` ledger, and acknowledges with `snapshot.home: { index, resumeToken }` only to that connection. Public player presence includes the optional `homeIndex` and never includes the credential. The browser waits for this private snapshot before spawning beside the assigned plot and clears its pending-creation flag after persisting the acknowledgement. A lost acknowledgement can safely retry `createHome: true` with the same saved credential; it resumes the existing plot instead of consuming another one.

Subsequent connections send `requestHome: true` and the saved `resumeToken`, omitting `createHome`. An unknown credential returns `invalid-resume` and closes the connection; the browser must preserve the saved credential and show the error instead of silently creating a different owner. If a cabin or connection is temporarily unavailable, user-facing errors use generic busy/unavailable wording. Existing owners resume independently of unused plot availability. Clearing browser storage loses that browser's ability to resume; offline owners' plots remain reserved. The credential is a bearer capability, so copying it shares access to the same anonymous cabin.

Home fields are additive to wire protocol version 1. An old client's nickname-only `hello` remains supported and consumes no permanent plot, allowing the backend to deploy before the frontend. Older hibernated connection attachments have no private home field; they acquire one only after an explicit opted-in `hello`. Client-provided `homeIndex` fields are discarded. The private credential is sent in a WebSocket message, never in URLs, query parameters, public diagnostics, or server log messages. Corrupt stored ownership fails closed rather than reallocating occupied plots.

## Bounds and verification

Internal safety bounds are `MAX_PLAYERS = 50` and `MAX_HOMES = 50`, with plot indices `0` through `49`. These are server configuration and test details; the player interface does not advertise numeric capacity. Incoming JSON packets are limited to 1 KiB. Positions and all numeric/string fields have explicit bounds. The per-connection token buckets allow 20 incoming messages per second with an initial burst of 30, at most 10 pose updates per second with a burst of 3, and 2 interaction messages per second with a burst of 5. Excess pose updates are dropped. Repeated invalid packets or excessive interaction messages close the connection. Rate state survives hibernation.

Run the backend checks:

```sh
npm run server:check
npm run test:protocol
```

The smoke harness also accepts a deployed worker host and an allowed browser origin:

```sh
node apps/server/websocket-smoke.mjs https://worker-host.workers.dev https://frontend-host.vercel.app
```

Use Node 24 for the harness. It opens three temporary sessions through the canonical path and random legacy aliases, intentionally reusing a client `_pk` to check server identity. It verifies shared presence, snapshot sync, disconnect cleanup, health, origin rejection, and path validation while reading fire and seat snapshots. It sends only `sync` messages. It never allocates cabins, supplies credentials, moves players, claims seats, or changes fire state: random aliases now reach the real shared world and must not be used for destructive smoke tests. The harness closes its temporary connections afterward and prints no private ownership data.

Mutation coverage stays in isolated protocol/core unit tests: concurrent home allocation, the additional plots, original ledger compatibility, full-state rejection, canonical routing, preserved returning owners, credential privacy, seat conflicts, fire persistence, malformed packets, rate limits, storage failures, retry idempotency, and reconstruction from hibernated connection state. The harness uses the existing `ws` dependency because Node's standard WebSocket constructor cannot set the browser Origin header.
