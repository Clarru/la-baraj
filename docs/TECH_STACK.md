# Lake Cinciș — Technical decisions

Status: v1 implementation baseline · 28 October 2026

## 1. Selected stack

| Responsibility | Selection | Decision |
| --- | --- | --- |
| Language/build | TypeScript, React, Vite | Static browser application |
| Rendering | Three.js, React Three Fiber, Drei | Reuse scene, asset and rendering helpers |
| Local movement/collision | Rapier via `@react-three/rapier`, Ecctrl | Reuse character movement; adapter isolates it |
| Live connection | PartySocket | Reconnection transport; resync remains our job |
| Multiplayer room | PartyServer | Room lifecycle/broadcast helpers on Durable Objects |
| Server hosting | Cloudflare Workers | One Worker routes to one production room |
| Shared state and saves | SQLite-backed Durable Object | One world authority and built-in persistence |
| Frontend/assets hosting | Vercel Hobby initially | Static `dist` output; no backend required there |
| UI | HTML/CSS overlay, React | Small interface; add Base UI for a specific complex control if needed |
| Developer tools | npm workspaces, ESLint, Vitest, Playwright, Wrangler | One repository; focused rules and integration checks |
| Geographic processing | Build-time OSM import and optional Copernicus DEM import | Output local data/meshes; no map API at runtime |

Use Node 24 LTS or a supported Node version meeting both Vite and Wrangler requirements. Pin an exact runtime patch when scaffolding. Commit `package-lock.json`; use `npm ci` for deployments.

The earlier Next.js suggestion is superseded. Vite avoids SSR/client-boundary setup for a canvas game and still deploys to Vercel. The initial app has no requirement for server-rendered pages. Neon, Drizzle, Supabase, Redis, R2, Blob, email, AI and a separate auth provider are not dependencies of v1.

## 2. Version evidence and installation gate

Registry metadata checked on 28 October 2026:

| Package | Observed release |
| --- | --- |
| `react` | 19.3.1 |
| `vite` | 8.3.5 |
| `three` | 0.186.1 |
| `@react-three/fiber` | 9.8.2 |
| `@react-three/drei` | 10.7.9 |
| `@react-three/rapier` | 2.2.0 |
| `ecctrl` | 2.0.2 |
| `partyserver` | 0.5.10 |
| `partysocket` | 1.3.0 |
| `wrangler` | 4.154.0 |
| `typescript` | 7.0.2 |

These are research observations, not a tested dependency lock. Ecctrl's published peer ranges fit the selected React/Three/R3F family. PartyServer and Wrangler expose different optional Workers-types peer ranges; during scaffolding use Wrangler-generated runtime types and verify the resulting installation rather than installing conflicting type packages blindly. TypeScript build compatibility is part of the spike. Select an earlier supported compiler if the actual tools require it, and record the exact installed versions.

Source metadata: [npm registry](https://registry.npmjs.org/), [Ecctrl package](https://github.com/pmndrs/ecctrl/blob/main/package.json), [PartyServer package](https://github.com/cloudflare/partykit/blob/main/packages/partyserver/package.json).

## 3. Repository shape

```text
apps/web/                 React/Vite client and HTML overlay
apps/server/              Worker, WorldRoom and Wrangler configuration
packages/shared/         Message schemas, game rules, map transforms, constants
assets/geography/        Source geometry, provenance, preview, licenses
apps/web/public/assets/  Optimized assets actually shipped to the player
docs/                    Product and architecture baseline
```

Separate server-only credentials/configuration from client code. `VITE_*` variables are public; only the WebSocket hostname and public configuration belong there. Member secrets, invite secrets and owner credentials never belong in frontend build variables.

## 4. Room architecture and authority

The browser downloads the static game and opens a secure WebSocket directly to the Worker. A fixed allowlisted world name routes to `WorldRoom`, a PartyServer subclass. Arbitrary room creation is rejected. One room coordinates the 30 connected players.

Rendering and the local player's Rapier/Ecctrl movement happen on the client. Remote avatars are interpolated visual proxies, not 29 independent authoritative physics simulations.

The server owns identity, cabin allocation, item ownership, fishing attempts/results, trophy state, hit validation, stun/immunity timestamps and score. Clients send intentions. Do not copy the official echo/broadcast example and treat it as validated game state.

Movement is a hybrid suitable for a trusted community: local immediate simulation, with server-accepted poses checked for finite coordinates, map bounds, speed/time envelopes, allowed state and simplified blocking geometry. Punch/cargo distance and line-of-sight use those accepted poses. Rejected movement is corrected. This is not a fully server-simulated physics game and will not provide competitive-grade cheat resistance. Full rollback/prediction and server Rapier are deferred.

## 5. Message and timing model

Use versioned JSON messages, validated at the server boundary. Begin with per-player movement deltas up to 10 Hz while moving, plus an immediate final stop pose. Do not send movement at the render frame rate. Send action/state transitions immediately. Tag actions with unique request IDs and poses with sequence numbers; reject stale data.

Suggested families: `hello`, `pose`, `interact`, `punch`, `drop`, `fishStart`, `fishReel`, `decorate`, `chat`; server responses: `welcome`, `snapshot`, `playerDelta`, `actionResult`, `worldEvent`, `error`. Names are implementation guidance, not an externally shipped API contract.

Start with changed-state broadcasts. At 30 players this can still create thousands of deliveries per second during all-player movement. Measure before choosing compact encoding or short event-driven batching. A maximum batch delay of roughly 100 ms is acceptable for movement; hits and ownership changes are immediate. No permanent 60 Hz server loop.

Use server timestamps for attack, stun, immunity and trophy scoring. Clients render countdowns locally. Wake the object for a necessary one-shot alarm, or settle an expired deadline on the next relevant event. Re-check deadlines on wake. Stop timers when there is no active game work.

PartySocket handles connection retries; our client re-authenticates and requests a fresh authoritative snapshot on every connection. Discard old optimistic contested state after reconnect. Back off on failure, and show quota/unavailability messages instead of reconnecting in a tight loop.

## 6. Hibernation and persistence

Enable PartyServer `static options = { hibernate: true }`. Configure `new_sqlite_classes` for the Durable Object migration. Use the SQLite-backed storage's key/value API for small versioned records initially; direct SQL and an ORM are unnecessary.

Persist permanent changes at the time they occur, before success acknowledgment. Use atomic storage transactions or equivalent SQLite transaction boundaries and request deduplication for cabin claims, fishing rewards and score increments. Serial dispatch alone does not make writes spanning `await` boundaries transactional.

Keep player/cabin/collection records separately addressable. Do not rewrite one enormous world snapshot for every change. Pose updates do not write storage. Connection attachments preserve identity, last accepted pose and timing state through hibernation; rebuild live maps from active connections. Store the small authoritative trophy record and relevant deadlines so contested state is not split across wake cycles. On a full restart, reset transient cargo safely and preserve durable progress, as the PRD allows.

Provide an owner-only export of durable world data before public use and before schema changes. Maintain a schema version and test restoring an export into a development room. Do not rely on a nonexistent shutdown callback to save progress.

## 7. Identity and access

The shared invite permits entry, not impersonation or owner powers. New members receive a server-issued random return credential with at least 128 bits of entropy, stored in the browser; the server retains a cryptographic hash and binds it to the member ID. It is also the optional recovery code. Send credentials only over HTTPS/WSS in the initial authentication exchange, never query strings, logs or analytics. Allow a short unauthenticated handshake window, cap pending connections, and close failures.

Validate the web origin and allow only the production/dev frontend origins, while recognizing Origin checks do not replace identity verification. Keep an explicit finite set of world IDs. Apply message length/rate limits, movement envelopes and ownership checks. One active session per member; an explicit takeover invalidates the previous session. Browser cross-site cookies between `vercel.app` and `workers.dev` are not assumed to work.

Owner tools use a separately provisioned server credential/role. No client-selected admin boolean. Include invite rotation, kick/ban, and a documented manual recovery procedure. Keep the launch private; external public discovery is a separate product decision.

## 8. Physics and asset simplifications

Use static ground/building colliders and one local character controller. A carried trophy attaches to a hand socket; a dropped trophy snaps to a server-approved surface. Display items use fixed slots. Water is a rendered surface and trigger volume. Magnet fishing uses a state machine and a visual line. No shared pile of physically simulated props.

Run a controller adapter for input enablement, facing, external impulses and animation. A server stun must clear input and stop horizontal locomotion, not merely stop playing the walk animation. Ecctrl is not a networking package. Its example art and animations need their own provenance check even though its code is MIT.

Batch/instance repeated trees and cabin parts; reuse materials and geometry; limit shadow casters; cap device pixel ratio; use baked/simple lighting; lazy-load cosmetic content. A low-poly shoreline mesh and flat water are cheaper than a streamed satellite world. Keep geographic imports outside normal browser execution.

## 9. Hosting and cost model

Target **$0 recurring platform cost within free quotas**. No paid plan or purchase has been authorized. A future Workers Paid upgrade starts at $5/month plus usage and tax; obtain owner authorization before upgrading. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

The Durable Objects free plan currently provides 100,000 request units/day and 13,000 GB-seconds/day. Incoming WebSocket messages use a 20:1 billing ratio; outgoing messages have no request charge. Other compute/storage quotas still apply, and exceeding a free quota stops affected operations. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Movement-only estimate:

```text
request units = moving players × updates/second × seconds / 20
30 × 10 × 3,600 / 20 = 54,000 per hour
30 ×  5 × 3,600 / 20 = 27,000 per hour
```

Two hours of everyone moving at 10 Hz exceeds the daily request allowance before other traffic. Reducing update rate, suppressing idle messages, or a paid upgrade may be needed. Hibernation does not make active play free. Duration, handler CPU, storage, development usage and other account projects also need measurement. Do not claim 30-player concurrency alone guarantees $0.

Vercel Hobby is intended for noncommercial personal use. It currently includes 100 GB/month of frontend data transfer. A hypothetical 20 MB first load for 30 players is about 600 MB before overhead; 100 such uncached group loads is about 60 GB. Asset compression and caching matter. [Hobby scope](https://vercel.com/docs/plans/hobby), [CDN usage](https://vercel.com/docs/manage-cdn-usage).

Vercel now supports WebSockets, but its own guidance requires reconnects at function duration limits and external coordination across instances. Durable Objects keep our room coordination and saves together. [Vercel WebSockets](https://vercel.com/docs/functions/websockets)

## 10. Verification before implementation is considered viable

- Install a consistent dependency set and commit the lockfile; build the client and typecheck the Worker.
- Confirm a selected character rig supports idle/walk/run/jump and a simple punch/stagger presentation.
- Two real browsers must agree on a hit, trophy pickup and reconnect outcome.
- Test hibernation/wake with no lost committed records.
- Test concurrent claims/rewards and malformed, repeated and unauthorized actions.
- Run 30 moving clients for 30 minutes; record request counts, CPU/duration, frame rate and delivery bandwidth.
- Check a returning browser and a second-device recovery. Verify no secrets appear in URLs or client bundles.

The architecture is selected. Dependency installation, compatibility, cost and performance are not yet validated by a running implementation.

## 11. Asset feasibility implementation update

The environment prototype now runs on the selected React/Vite/R3F/Rapier/Ecctrl stack. Installed versions are recorded in `package-lock.json`; the local runtime is Node 25.6.0. This validates that part of the stack for the asset experiment, not the future PartyServer protocol or cloud deployment.

The richer style test uses CC0 copies of Quaternius environment meshes rather than defaulting to the earlier Kenney shortlist. Blender 5.2.3 from the owner's Steam installation assembles the character study and renders native-alpha distant-tree bakes. Detailed nearby vegetation switches to those bakes at distance. The water reuses Three.js's Water addon with a procedural normal map, planar reflections and a shared sun direction. No paid assets or cloud services were purchased.

The HUD now uses self-hosted Barlow/Barlow Condensed and Phosphor icons, following the owner's rejection of the initial serif/cream interface. The art direction remains a candidate under test. See [the test results](feasibility/RESULTS.md) for actual measurements, coverage, limitations and the decision.
