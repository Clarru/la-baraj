# 2048 arcade stations — scoped source review

Status: **implementation, independent review, bounded actual-Game acceptance and combined checks complete; production publication pending**.

This record covers the ordinary three-station extension relative to baseline `cf01d5a`. It preserves the incumbent 2048 cabinet visuals and rules while adding a row of three cabinets, server-authoritative station occupancy, public spectator state, and a compatibility path for clients or Workers that do not advertise numbered stations. The frozen runtime candidate is `5cbf38bdedb5deb3b5411877ac3ccccd149247b0`; green GitHub CI is recorded as run `41116338799`. The bounded browser pass used the actual Game, GLB, physics and local SharedWorker with two owned identities. The independent frontend recapture review returned **SHIP** for the bounded source + actual-Game capture scope, with no new regressions. No production frontend `55` publication or Worker deployment is claimed.

## Incumbent cabinet retained

The extension continues to use the existing authored GLB, forest-green painted-timber / iron PBR treatment, live mesh Canvas screen, Bree Serif/Alegreya Sans display language, personal board persistence and derived global leaderboard. It does not add Undo or change the established game rules.

The active board footer remains the exact shipped copy:

> Use WASD or mouse to move them

The screen and assistive controls retain the same actions. Visual tile animation is now a 120 ms constant (`ARCADE_TILE_MS`), a 20% reduction from the earlier 150 ms value. Input cadence is a separate 125 ms client boundary (`1000 / 8`), matching the server's eight-actions-per-second bucket; an exact-boundary test protects the distinction. Three visible machines share one fixed renderer-owned tile atlas and use bounded instanced tile draws; tile movement and idle updates do not upload the atlas texture.

## Station topology

`ARCADE_STATIONS` defines the new row beside the gathering tables, facing the open approach from the road:

| Station ID | X | Z | Notes |
| ---: | ---: | ---: | --- |
| 0 | -11.0 | 73.8 | First cabinet in the row |
| 1 | -9.4 | 73.8 | Middle cabinet |
| 2 | -7.8 | 73.8 | Third cabinet |

Each station inherits the incumbent cabinet dimensions (0.76 m wide, 0.72 m deep, 1.92 m high). The focused asset checks cover dry land, stable footprint, clearance from the existing table and more than 1.5 m between adjacent cabinets.

The old east-edge station at `(12, 70.37531356447997)` remains the legacy fallback. It is represented locally as `LEGACY_ARCADE_STATION` with ID `-1`, but old wire messages omit `stationId`; the server interprets an omitted ID at the original `ARCADE_STATION` location. A client only uses the numbered row when the snapshot advertises `features.arcadeStations` in addition to `features.arcade2048`.

## Server-authoritative station lifecycle

Opening a numbered cabinet is a server transaction before the focus camera opens. The client sends `resume` with `stationId`, waits for the authoritative response, verifies that its own player occupies that station, and only then sets the local station ID and asks the camera to focus. A client-side approach or a public occupancy snapshot cannot claim a cabinet.

The server stores the active claim as transient connection attachment state (`arcadeStation`, `arcadeClaim`, `arcadeDirection`). It is not a Durable Object SQLite seat, does not alter the existing Planes/Cruce seat records, and is not persisted as a world resource. The claim path uses a server-generated `crypto.randomUUID()` generation token. On a failed old request, the token must still match the connection's current claim before releasing it, so an old failed request with a reused client request ID cannot release a newer successful claim.

The authoritative lifecycle is:

- A free station can be claimed by one connection after distance, home, vehicle, seat and stun checks pass.
- A second player receives a station-blocked error before entering the camera. The public station delta may show the occupant's display name, current board, best score and last accepted move direction, but never owner keys, credentials, request IDs, write-budget metadata or claim generations.
- One owner cannot occupy another numbered station or tab while its first station is active.
- `leave`, disconnect, walking more than 3.5 m from the claimed station, entering a vehicle, and taking a seat all release the transient claim and broadcast an empty public station state.
- Releasing a claim does not write or delete the owner's saved board. Reopening the station restores that player's existing board and best score.

The existing per-player board persistence and global leaderboard remain in `Arcade2048Service`. Public station DTOs deliberately use `boardView` (`game` and `best`) rather than the private full view, so the spectator row is not a second leaderboard or a credential-bearing record.

The client entry lifecycle is isolated in [`use-arcade-entry.ts`](../../apps/web/src/use-arcade-entry.ts). It tracks selected and pending station IDs separately, releases the pending or selected ID immediately on close, disabled state or unmount, clears the opening flag without waiting for an acknowledgement, and uses a generation token so a late completion cannot release or clear a newer attempt on the same cabinet. Four behavioral jsdom tests cover retry after cancellation, disabled/unmount cleanup, timeout/out-of-range/occupied cleanup and offline/occupied preflight rejection.

## Compatibility and reconnect handling

The wire protocol keeps `stationId` optional. It accepts only integer IDs 0–2 when present and parses `leave` without trusting forged owner or occupancy fields. A newer frontend connected to an older Worker can retain the original single east station when only `features.arcade2048` is advertised. A frontend that does not receive the arcade capability does not send arcade actions.

The reconnect path distinguishes a real `online`/`connecting`/`reconnecting`/`offline`/`full`/error status from a temporarily empty loading board. Each restore belongs to a connection generation; pending state is reset when the generation changes, and an arcade response whose request is no longer pending is ignored. This prevents a late stale restore from replacing a newly loading or newly opened board. A real `online` capability response can restore the private board; an empty loading snapshot or stale reply cannot be treated as a new game.

The latest private-request generation also prevents an older pending or timed-out acknowledgement from publishing a private board after a newer request has taken over. The reconnect tests cover replacing an unfinished restore and ignoring its late failure while accepting the current restore.

## Camera and renderer behavior

The focus camera targets the selected station's position and keeps the existing 0.5 s focus blend and reduced-motion immediate path. On exit, `arcadeExitCamera` preserves the current sight-line direction, targets the player's walking height (`+0.65 m`) and pulls back to a minimum 4.8 m instead of snapping to a fixed heading. The camera helper handles coincident points without producing non-finite values.

All three cabinets reuse the renderer-scoped tile atlas. Each screen retains its own instanced tile layer and mesh-facing transform, while atlas generation and font-ready redraw are shared per renderer. The public spectator screen uses the same board values and occupant label as the station DTO; it is not a private screen overlay.

## Focused source evidence

The frozen-candidate automated pass reports **470 web tests in 83 files** and **168 protocol/backend tests in 12 files** passing after the frontend lifecycle fix. Server TypeScript, root TypeScript and the production build pass. The Worker dry-run bundle is **178.12 KiB** uncompressed and **43.91 KiB** gzip, and compiles successfully without deployment. The backend independent review is **ship**; the frontend source and bounded browser recapture reviews are also **ship**, with no remaining blocker in that scope.

The focused source coverage includes:

- decoded asset dimensions, dry placement, table clearance, station spacing and the preserved joystick pivot;
- exact active footer text, no Undo, 120 ms visual animation versus the separate 125 ms input/server cadence, exact-boundary handling, pose interpolation, bounded instancing, shared atlas reuse and spectator-board labels;
- 4.8 m same-angle camera pullback and coincident-target safety;
- selected/pending station entry IDs, immediate release on close/disabled/unmount, four jsdom entry lifecycle behaviors, and latest-request-generation protection for late private acknowledgements;
- station-ID bounds, omitted-ID protocol compatibility and `leave` parsing;
- atomic claims, occupied-station rejection, public DTO redaction, three independent games, hibernation, leave/disconnect/walk/seat release, same-owner duplicate occupancy rejection, storage-failure cleanup and stale-claim generation protection;
- persisted per-player boards and global leaderboard behavior retained through the existing Worker service.

Policy 54 is merged. Green GitHub CI for the frozen browser candidate is recorded as run `41116338799`. The later code integration `9a21810` merges `main` `755c7f7` without conflict and preserves both the Meadow import/render and arcade integration. Combined validation passes **495 web tests in 84 files**, **168 protocol/backend tests in 12 files**, root and server TypeScript, the production build, and the Worker dry run (178.12 KiB / 43.91 KiB gzip). These combined source checks do not turn the earlier frozen browser captures into measurements of the Meadow integration.

The earlier Vercel quota note is historical: `main` was reported accepted READY publicly at `50`, which does not publish `55` or prove future availability. Publication of `55` remains pending release-owner coordination; no blanket current quota block is claimed.

## Bounded actual-Game browser evidence

The candidate was loaded through the real Game/GLB/physics/local SharedWorker path at CSS 1707×960 with DPR 1.5 on the recorded M4 Pro / 48 GiB / macOS 26.5.2 setup. All three nearest stations opened in sequence (IDs 0, 2 and 1). The occupied-station check disabled the entry button, kept E from focusing, confirmed that the public board matched player A while player B's private game stayed unchanged, and captured the blocked state in [`occupied-blocked.jpg`](captures/arcade2048-stations/occupied-blocked.jpg). The row and incumbent cabinet appearance are visible in [`three-cabinets-final.jpg`](captures/arcade2048-stations/three-cabinets-final.jpg) and [`three-cabinets-spectator.jpg`](captures/arcade2048-stations/three-cabinets-spectator.jpg); the focused screen/footer is visible in [`cabinet-one.jpg`](captures/arcade2048-stations/cabinet-one.jpg) and [`live-board.jpg`](captures/arcade2048-stations/live-board.jpg).

The acceptance record [`acceptance.json`](captures/arcade2048-stations/acceptance.json) and supporting records [`pending-cancel-race.json`](captures/arcade2048-stations/pending-cancel-race.json), [`walk-away.json`](captures/arcade2048-stations/walk-away.json), and [`reconnect-resume.json`](captures/arcade2048-stations/reconnect-resume.json) establish:

- mouse drag on the real mesh was accepted; local records reached score 60;
- physical Leave, Escape, and W during the exit blend retained the lake/world heading; this is visual evidence only, not a numerical camera trace;
- delayed entry cancellation freed the middle cabinet at 1,327 ms, allowed one retry, and the old completion at 21.7 s left the newer attempt active;
- walking away released the claim at 2,360 ms before the delayed completion, with no focus afterward;
- a reload created a new socket and restored the exact personal board (score 60, 13 moves, revision 14); local records were preserved;
- both browser clients reported no console errors.

The focused metrics in [`metrics.json`](captures/arcade2048-stations/metrics.json) record 8 accepted moves, 8 base-screen uploads, no atlas upload attributed to movement, and 128 matrix updates. R3F frame timing was median 8.3 ms / p95 10.1 ms, with focused-cabinet CPU p95 0.1 ms. These are frame and resource counters, not a presented FPS number; no numerical live-camera trace or presented-frame FPS is claimed. [`exit-heading-and-row.jpg`](captures/arcade2048-stations/exit-heading-and-row.jpg) is the visual framing evidence for the exit/row state.

The browser pass did not exercise production multiplayer, genuine mobile/touch, reduced-motion media, three simultaneous players, or storage-failure injection in the browser. Menu/close, walk-away and reload are actual browser paths; the exact unmount and eligibility-change cleanup remains jsdom-only coverage from the four entry lifecycle tests and was not a browser fault-injection run. No production `55` deployment occurred. The independent frontend recapture review returned **SHIP** for this bounded scope, with no new regressions.

## Evidence boundary

This is a source, automated-test and bounded actual-Game browser documentation record. It does not claim production multiplayer, mobile/touch, reduced-motion media, three-player concurrency, browser storage-fault injection, presented FPS, numerical live-camera tracing, production `55` publication or Worker deployment. The `main` 50 code integration and combined checks are complete as recorded above; the combined build has not received an additional browser performance pass.

The extension remains an ordinary visual and interaction extension of the incumbent cabinet. Existing global `DESIGN.md`, `.impeccable/design.json`, `PRODUCT.md`, HUD, world materials and other games remain outside this documentation scope; pre-existing design-document drift is reported elsewhere and is not repaired here.
