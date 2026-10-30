# Personal motorboats in La Baraj

Phase 1 gives every player a personal motorboat on Lake Cinciș. The boat is a 6.1 m varnished-mahogany runabout (see "The runabout" below; it replaced the 3.6 m Phase 1 placeholder). It starts parked beside the dock nearest the player's cabin, 3.7 m east of the dock centreline and 13 m out from the south shoreline, facing the open lake. Within `BOAT_BOARD_DISTANCE` (1.6 m from the hull's edge) V boards; the prompt "Drive the motorboat" appears when the player is near the hull. The driver sits in the starboard seat behind a steering wheel with both hands on the grips. Phase 1 is single-boat, single-driver and surface-only; there is no fuel, damage, passengers or boat-to-boat collision.

## The runabout

- Size (`BOAT_DIMENSIONS`, `apps/web/src/boat-geometry.ts`): length 6.146 m, beam 2.207 m, bow extent 3.683 m, stern extent 2.463 m, draft 0.500 m, deck height 0.8 m. Six seats; only the driver seat is used (`Seat_0`..`Seat_5` are empties for later passengers).
- Origin and pivot: on the waterline at the hull pivot, 40% of the length forward of the transom. While driving, the physics capsule sits at this pivot, so the boat turns about itself; the driver is drawn at the `DriverSeat` empty, offset `BOAT_DRIVER_OFFSET = [0, -0.04, 0.33]` from the capsule root.
- Assets (`apps/web/public/assets/optimized/`): `Lake_Runabout.glb` 891,932 bytes, 34,879 triangles; `Lake_Runabout_LOD.glb` 323,904 bytes, 4,091 triangles; textures are WebP at most 1024 px. Catalogued in `apps/web/public/assets/runabout-library.json`. Blender renders: `docs/art-direction/runabout/runabout-blender.png`, `runabout-blender-cockpit.png`.
- Reflections: `apps/web/src/boat-environment.ts` gives the boat its own PMREM gradient environment, intensity 0.15 at night up to 1.0 by day (from `lastLighting()`).
- Remote players see the LOD boat. It casts no shadows and is not solid.

## Controls

- **V** near the parked boat: board. While driving: step out. Onto land if a bank or dock is within the exit candidates (the far ring, `EXIT_FAR_CLEARANCE` = 3 m beyond the hull edge, reaches about 4.1 m to the sides and 6.7 m ahead of the pivot; Phase 1: 4.5 m, superseded), otherwise into the water beside the boat.
- **W** throttle, **S** brake then reverse, **A / D** steer. The boat turns only while it is moving.
- **Shift** (left or right, the same key the character runs with) held while throttling boosts the boat to 12.8 m/s. Shift without W does nothing. Releasing Shift lets the boat ease back to cruise.
- **R** returns the player to their cabin and puts the boat back at the nearest dock.

## Tuning

Values live in `BOAT_TUNING` in `apps/web/src/boat-motion.ts`.

- Cruise speed 8 m/s, reverse 2 m/s.
- Acceleration 2.4 m/s², reverse acceleration 1.5 m/s², linear coast-down 0.35 m/s², brake deceleration 5 m/s².
- Maximum turn rate 0.9 rad/s (the scooter uses 1.65), reached at 3 m/s and above.
- Wheel travel 2.4 rad, hull lean at most 0.06 rad, ride height 0.75 m, bob amplitude 0.03 m.
- Boost (`boostMultiplier` 1.6, `boostAccel` 2.0 m/s², `boostDecay` 1.6 m/s², `boostTurnFactor` 0.75): with W and Shift held the top speed is cruise × 1.6 = 12.8 m/s. The boat reaches cruise at the normal 2.4 m/s², then climbs at 2.0 m/s² (about 2.4 s from 8 to 12.8 m/s). With Shift released and W still held, a boat above cruise slows back to 8 m/s at `boostDecay`, 1.6 m/s² (about 3 s from 12.8). Above cruise the maximum turn rate eases from 0.9 rad/s down to 0.9 × 0.75 = 0.675 rad/s at 12.8 m/s (`boostTurnScale`), so boosted turns are wider. At or below cruise the motion is unchanged.
- Server limits at boost: the pose `speed` field is accepted up to 100 m/s (`packages/shared/protocol.ts`). The server has no per-pose position-jump or movement-speed check; it only rate-limits poses (10 per second, burst 3). At 7 poses per second a boosted boat moves about 1.83 m per pose, well under the remote client's 10 m snap distance (`multiplayer-players.tsx`). No protocol or server change was needed.
- Hull draft is now 0.5 m (`BOAT_DIMENSIONS.draft`). The hull origin sits on the waterline (`LAKE_LEVEL`, the parked boat position in `boat.tsx`) and the driver's capsule rides at `LAKE_LEVEL + BOAT_TUNING.rideHeight` (0.75 m, `boat-motion.ts`). Phase 1, superseded: the hull floor never went below `LAKE_LEVEL + 0.15` (`BOAT_FLOAT_HEIGHT`, a constant that no longer exists).
- Bank stop: the boat probes the water `bowExtent + 0.8` = 4.483 m ahead (`BOAT_PROBE_DISTANCE`; Phase 1 placeholder: 2.2 m, superseded) and stops when it is shallower than 0.5 m (`BOAT_MIN_DEPTH`), both in `apps/web/src/boat-placement.ts` (`boatBlockedAhead`).
- Exit candidates (current runabout): measured from the hull edge, sides at beam/2 + 0.7 m and beam/2 + 1.7 m, bow at bowExtent + 0.7 m and bowExtent + 1.7 m, then a land-only far ring of left, right and bow at +3 m (`boatExitCandidates`). Phase 1 placeholder, superseded: sides at 1.6 m and 2.6 m, bow at 2.2 m and 3.2 m, far ring at 4.5 m. The first candidate whose ground lies no more than 0.4 m below the lake surface (`BOAT_WADE_DEPTH`, shallower than the 0.62 m swim threshold) becomes the exit, so the driver wades rather than swims. If none qualifies, the driver enters the water beside the boat at the first candidate.
- Placement (`apps/web/src/boat-placement.ts`): `BOAT_DOCK_SIDE_OFFSET` 3.7 m (Phase 1: 3.2, superseded), `BOAT_DOCK_LAKE_OFFSET` 13 m (Phase 1: 11, superseded), `BOAT_BOARD_DISTANCE` 1.6 m from the hull edge via `distanceToHull` (Phase 1: 3.5 m from the boat origin, superseded). Spawn at the x = 0 dock: (3.7, ·, 44.875), yaw pi.
- Hull collision while driving (`apps/web/src/boat-collision.ts`, `boatHullBlocked`): a Rapier shape cast of the hull stops the boat against docks and pilings, so a boat can no longer pass through them.

## Jet stream

The driven boat no longer draws a ring on the water; swimmers keep theirs. Instead a jet stream (`apps/web/src/boat-spray.tsx`, sizing in `apps/web/src/boat-spray.ts`) trails from the transom: a V wake of two foam arms opening from the transom corners plus a centre wash, fading to transparent along its length, and a rooster tail of 20 foam particles thrown up and back behind the transom. It is a child of the yawing boat root, anchored at `-BOAT_DIMENSIONS.sternExtent` on the boat's local Z and on the waterline (`LAKE_LEVEL` + 0.03 m). Its size follows the hull speed (`spraySize`): nothing below 0.5 m/s, fading in by 2.5 m/s, a 9 m wake spreading 4.2 m at cruise, and about 1.46 times that at boost. Foam brightness and opacity follow the day (`sprayIntensity`, 0.3 at night up to 1.0 at noon, from `lastLighting()`). Geometry and the two shader materials are shared by every boat; each boat passes its size to the shared uniforms just before its own draw. Remote boats size their jet stream from the pose `speed`, so no protocol change was needed.

## Wheel and hands

Wheel angle is `clamp(turnRate / maxTurnRate) × 2.4 rad`. A positive value is a left turn and reads counter-clockwise to the driver. Two-bone arm IK (`apps/web/src/limb-ik.ts`) places each hand on its wheel grip every frame. At wheel angle 0 both hands hold their grips. At larger wheel angles a hand that cannot reach its grip slides along the rim (same hub, plane and radius) to the nearest reachable point, so it stays on the wheel (`apps/web/src/boat-rider.ts`).

## Multiplayer

The existing pose carries `vehicle: "boat"`; no new message type is added. A remote client infers the wheel angle from the driver's yaw rate. Remote boats are drawn with the LOD GLB, cast no shadows and are not solid. Clients that have not reloaded show the driver as a seated avatar with no boat. Deploy the la-baraj-world Worker before merging to main: an old Worker rejects `vehicle: "boat"` as an invalid packet and disconnects a boating player after three strikes (about half a second at 7 Hz). This is a blocking release step.

## Known limits

- A parked boat is visible only to its owner. Other players see a boat once it is driven.
- Parked boat collision: the runabout verification reported the walker standing inside the parked hull. In code the parked boat's fixed collider is mounted whenever the boat is not driven (`ParkedBoat`, `apps/web/src/boat.tsx`), is not a sensor and uses default collision groups. It is a box over the whole hull plan (2.207 × 6.146 m) from 0.10 m below to 0.60 m above the waterline. A swimmer's capsule (radius 0.3 m, half-height 0.35 m, centre about 0.50 m above the waterline) spans 0.15 m below to 1.15 m above it, and a walker standing in the shallows near the stern (about 0.6 m deep) spans about 0.30 m below to 1.00 m above it, so both overlap the box and are blocked. The box top is 0.2 m below the deck (0.8 m), so a player who jumps or drops onto the boat stands on the box with their feet slightly sunk into the deck and windshield. That is the most likely reading of the report; no collider change was made.
- Boat position is not persisted; it resets to the dock on reload.
- The north shore terrain is a proxy, so boat-to-bank behaviour there is approximate.
- Remote players and remote boats (including the new LOD boat) were not verified in a live room: the runs were offline and the production Worker was not contacted.
- At a gentle bank the boat stops in shallow water a few metres from the shoreline. The exit reach extends to the far ring (`EXIT_FAR_CLEARANCE` 3 m beyond the hull edge: about 4.1 m to the sides, 6.7 m ahead of the pivot; Phase 1 reach of 4.5 m, superseded) and shallows up to 0.4 m deep (`BOAT_WADE_DEPTH`) count as ground, but V at a shallows stop on gentle banks may still drop the driver into water; wading ashore takes a few seconds; docks and steeper banks give land exits. North-shore crossing: see Browser verification item 7.
- Dev-mode verification is blocked by a bug that predates the boats. `React.StrictMode` runs effects twice, and the cleanup at `apps/web/src/NearbySolids.tsx:38` calls `isValid()` on a Rapier world that is already freed. The error is "null pointer passed to rust" and the scene boundary shows "The lake couldn't load". It reproduces on the base commit (6d6e3d8) as well as this branch.

## Browser verification (Phase 1 placeholder boat; superseded by Runabout verification below)

Because dev mode cannot load the scene, the run used the production bundle: `VITE_GAME_DIAGNOSTICS=1 npm run build`, then one `npm run preview` on 127.0.0.1:4173, offline with no room server. Playwright Chromium at 1280 x 720, synthetic `KeyboardEvent`s on `window`, telemetry from the `movement-metrics` output. The player's home is cabin 1; the central dock is at x = 0 and the boat spawns at (3.2, 0.05, 46.9), yaw pi.

1. Boarding. Swimming up to the parked boat shows "Drive the motorboat / W throttle . A/D steer . V step out" within 3.5 m. V boards from the water: vehicle "Motorboat", animation `Activity_Sit`, body at (3.2, 0.79, 46.9), y settling 0.80 to 0.77 with no upward pop. The driving hint reads "Motorboat / V near a bank to step out".
2. Throttle and turning. W takes the boat from 0 to 8 m/s in about 3.5 s (2.24, 4.76, 6.92, 8.0 at 1 s steps) and holds 8.0. A while moving increases yaw (left turn), ramping toward 0.9 rad/s. The wheel turns, both hands stay on the grips, the hull leans and a wake ring shows. After releasing W the boat coasts 8.00, 7.69, 7.32, 6.96, 6.64 m/s over 4 s (0.35 m/s^2, linear).
3. South bank at full throttle. Before commit 48e95a5 the boat crossed the shoreline (`inWater` false from z about 87.9, body y 0.83 to 1.81) and stopped about 4 m inland. V then parked the hull under the bank and re-boarding left the body inside terrain until R. After the fix the boat stops at (-8.7, 0.8, 59.5) still in water, y steady at 0.78 to 0.83, speed 8 to 0 within one frame, with no climb and no jitter. S reverses away at -2 m/s; W drives back and stops at the same spot.
4. Exit at the bank and at the dock. V at the bank stop dropped the driver into the water; this run predates the 4.5 m far exit ring. V at the dock boat steps onto the deck at (1.6, 1.98, 46.9), grounded.
5. Mid-lake exit. V at (3.2, -16.5) at 7.4 m/s: the driver swims 1.6 m to port of the boat (`Swim_Idle`, y settles to 0.55, vehicle null) and the re-board prompt shows. V again re-boards from the water.
6. Return. R from anywhere, including the stranded pre-fix state, puts the player at the home spawn (55.4, 6.05, 63.8) and the boat back at the dock spawn, confirmed by boarding there again.
7. North-shore crossing (bundle d6e102e). From the central dock the boat ran 651 m north at a steady 8 m/s and stopped after ~82 s at (3.2, 0.8, −604.3), still in water (analytic depth 0.36 m at the hull), y steady 0.77–0.83, no climb (`captures/boat-north-shore.png`). V at that stop still produced a water exit at the first candidate (1.6, −604.3) even though the analytic lake bed there is only 0.32 m deep; this reproduced twice after re-boarding (`captures/boat-north-shore-exit.png`). From there the driver waded ashore in about 2 s: standing (grounded) at z −606.8 in 0.18 m of water, on dry land at z −613 (y 1.47), no fall-through. R returned the player home and the boat to the dock. Console: 0 errors (favicon 404 only).

Console in the preview session: 0 errors and 2 existing warnings (THREE.Clock deprecation; Rapier "deprecated parameters for the initialization function"). A favicon.ico 404 appears only in dev.

## Runabout verification

Run on commit 0ad59ae (Tasks 1 to 4), production bundle built with `VITE_GAME_DIAGNOSTICS=1`, one `npm run preview` on 127.0.0.1:4173, offline, Playwright Chromium 1280 x 720, synthetic `KeyboardEvent`s on `window`, telemetry from `movement-metrics`. The player's home is cabin 1 (spawn (55.4, 6.05, 63.8)); the runabout spawned at (3.7, 0.8, 44.875) beside the x = 0 dock.

1. Parked. The boat is visible beside the dock, east side, in the lake (`captures/runabout-parked.png`). Walking up to it, the prompt "Drive the motorboat / W throttle . A/D steer . V step out" showed with the player at z 47.88 (3.0 m from the pivot at z 44.875, about 0.5 m from the stern edge); it did not show at z 49.38 (about 2.1 m from the stern edge). A parked boat was reported as not solid for the player (the walker could stand inside the hull volume); Task 6 found the collider correct (see Known limits).
2. Board and drive. V from the water boarded: vehicle "Motorboat", animation `Activity_Sit`, y 0.77. The hint reads "Motorboat / V near a bank to step out". W for 6 s reached 8.0 m/s (the cruise speed) at (3.7, 0.8, 10.9). Holding W and A then curved the boat to the left at 8 m/s. `captures/runabout-turning.png` shows the hull under way with the wheel turned; the camera is beside the boat, so the hands are only partly visible there. `captures/runabout-wheel-hands.png` is a closer view from above and behind, with the wheel turned and the driver's right hand on the rim; the left hand is occluded.
3. Cockpit. Using only the existing camera (drag to orbit, mouse wheel to zoom in) the camera was orbited above and behind the boat and zoomed in (`captures/runabout-cockpit.png`): mahogany coaming, tufted seats, dashboard gauges and the driver in the right-hand seat.
4. Dock collision at full throttle. Held at 8.0 m/s, the boat's path went from (-5.22, 49.12) to a stop at (-4.43, 50.66), heading 0.45 rad, beside the west side of the dock with the speed 0 within one telemetry sample; the hull did not enter the dock (`captures/runabout-dock-stop.png`). In an earlier approach the boat stopped at (0.7, 42.5) heading toward +z and could be reversed away. Caveat: both stops were from approaches that met the dock's side and pilings at a shallow angle, not a head-on hit on the dock's end (my steering loop overshot and swung wide).
5. Exits. V at the dock stop stepped onto the deck at (-0.73, 1.98, 48.88), grounded. V at a bank stop at (22.81, 0.8, 25.48) put the driver at (25.53, 0.82, 30.13), standing grounded in shallow water (about 5 m from the pivot, so a wade-ashore candidate). Re-boarding from the dock deck and from the shallows worked once the player was within `BOAT_BOARD_DISTANCE` of the hull edge (it did nothing at about 1.75 m). V mid-lake at (2.1, -5.6) and 8 m/s: the driver swims beside the boat (`Swim_Idle`, y 0.53, vehicle null) with the "Drive the motorboat" prompt (`captures/runabout-swim-exit.png`). R then returned the player to (55.38, 6.05, 63.79); walking back, V boarded the boat at its dock spawn (3.7, 0.77, 44.88).
6. Dusk. With `?time=19.5` the in-game clock showed 19:30 and the lake, shore and hull were in dusk light with the boat still reading clearly (`captures/runabout-dusk.png`).
7. Console: 0 errors apart from the favicon.ico 404, and 2 warnings (THREE.Clock deprecation; Rapier deprecated initialization parameters), across the whole session including the reload for dusk.
8. Frame time (`requestAnimationFrame` deltas over 3 s, 1280 x 720). The display ran at 120 Hz, so every run is vsync-bound at 8.33 ms and the numbers cannot separate the boat's cost: boat on screen, parked at the dock, median 8.2 / mean 8.33 ms (three 3 s runs, mean 8.33 each; p95 9.1 to 9.3); boat off screen at the same spot, (two runs) median 8.2 / mean 8.34 and 8.33 ms (p95 9.2); driving at 8 m/s, median 8.1 / mean 8.34 ms (p95 10.0, max 11.0). No frame dropped below 120 Hz in any run. Headroom beyond 120 Hz was not measured.
9. Jet stream and boost (Task 6 build b3516f6, captured by the controller). W held about 6 s from rest: 2.22, 4.74, 6.90, 8.0 m/s at 1 s steps (`captures/runabout-jet-stream.png`). Shift+W: speed rose 8.0, 9.8, 11.9, 12.8 m/s and held 12.8 (`BOAT_TUNING.cruise` x `boostMultiplier`); the plume and V wake are larger and longer (`captures/runabout-jet-stream-boost.png`).
10. Hands: with the boat stopped and the wheel at angle 0, both hands are on the rim (`captures/runabout-hands-both.png`).
11. Night: fresh load with `?time=23` (clock 23:00); at the central dock, player at (7.8, 0.73, 46.5), hull edge about 3 m away so no boarding prompt yet; chrome is dark and muted with no glow (`captures/runabout-night.png`).
12. Console on both of those loads: 0 errors (a favicon.ico 404 on the first load only) and the two known warnings.

Issues observed (not fixed, no source changed in this task):

- Hull collision can wedge the boat against the dock. After the boat stopped alongside it, W alone did not free it; reverse with a steer (S + A/D) was needed, because the boat turns only while moving. Twice an automated W-only loop left the boat stuck until reversed.
- The boat could not be reversed out in the first S hold after one bank stop (it moved only 0.3 m in 3 s); a later S hold worked normally, so this may be input timing from my synthetic keys, not a bug.
- The parked boat was reported as not blocking the player (see item 1); Task 6 found the collider correct (see Known limits).
- The boarding prompt appears only close to the hull; at 2.1 m from the edge it was not shown.

## Observed issues

- Fixed during verification: the boat could cross the shoreline at full throttle and strand the player in terrain (fix 48e95a5).
- Open: on the north shore (item 7), V at the shallows stop gave a water exit although the analytic lake bed at the first candidate is only 0.32 m deep, so the 4.5 m exit ring and the 0.4 m wade depth could not be confirmed on a gentle bank. Hypothesis, not confirmed: the exit floor ray reads the physics trimesh, while `boatBlockedAhead` and the telemetry use the analytic `terrainHeight`, and near the proxy north shore the two appear to disagree. The swimmer also stays in swim mode at an analytic depth of 0.32 m, below `EXIT_DEPTH` 0.42. Suggested next step: make the shallows probe and the exit ray read the same surface, either by probing the physics floor or by evaluating the exit against analytic depth.
- Open: dev-mode scene load fails because of the StrictMode and Rapier cleanup bug, unrelated to the boats.

## Captures

- `captures/boat-prompt.png`: swimmer beside the parked boat with the boarding prompt.
- `captures/boat-turning.png`: wheel turned with both hands on the grips, hull leaning, wake ring.
- `captures/boat-beached.png`: boat stopped at the south bank, still in water (after the fix).
- `captures/boat-swim-exit.png`: driver swimming beside the boat after a mid-lake exit, with the re-board prompt.
- `captures/boat-north-shore.png`: boat stopped in the shallows off the north shore after the 651 m crossing.
- `captures/boat-north-shore-exit.png`: driver in the water beside the boat after V at the north-shore stop, with the re-board prompt.

Runabout captures (all 1280 x 720, taken for the runabout verification above):

- `captures/runabout-parked.png`: the runabout parked beside the dock.
- `captures/runabout-turning.png`: under way, wheel turned. It shows the pre-jet-stream wake ring around the boat, as do `runabout-dusk.png` and `runabout-cockpit.png` (the ring was removed in Task 6).
- `captures/runabout-wheel-hands.png`: wheel turned with the driver's right hand on the rim and the left hand occluded, from above and behind.
- `captures/runabout-jet-stream.png`: driving at 8.0 m/s, seen from the starboard-rear quarter: rooster-tail spray dots rising off the transom and a fading V foam wake behind the hull, no ring around the boat.
- `captures/runabout-jet-stream-boost.png`: Shift+W boost at 12.8 m/s; the spray plume and V wake are visibly larger and longer than at cruise.
- `captures/runabout-hands-both.png`: boat stopped, wheel angle 0, camera orbited to the bow and zoomed with the existing mouse controls: both hands on the wheel rim behind the windshield, driver in the starboard seat.
- `captures/runabout-night.png`: `?time=23` (clock 23:00), player wading beside the parked boat at the central dock: the chrome windshield frame, rub rail and cutwater are dark and muted with no glow, and the hull still reads as varnished wood.
- The jet-stream, boost, hands-both and night captures were taken on the b3516f6 build (before the boostDecay tuning change, which does not affect the visuals).
- `captures/runabout-cockpit.png`: cockpit, high and close with the existing camera zoomed in.
- `captures/runabout-dock-stop.png`: the boat stopped beside the dock after full throttle, bow short of the piling.
- `captures/runabout-swim-exit.png`: driver swimming beside the boat after a mid-lake exit, with the boarding prompt.
- `captures/runabout-dusk.png`: the boat at 19:30 (`?time=19.5`).

The earlier `captures/boat-*.png` images show the Phase 1 placeholder boat.

All captures were taken offline, so the header shows "Offline" and a "Room server is not configured" notice.
