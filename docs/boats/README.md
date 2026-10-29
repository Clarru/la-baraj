# Personal motorboats in La Baraj

Phase 1 gives every player a personal motorboat on Lake Cinciș. The boat starts parked beside the dock nearest the player's cabin, about 3.2 m east of the dock centreline and 11 m out from the shoreline, facing the open lake. Within 3.5 m of it (on land, on the dock or in the water) the prompt "Drive the motorboat" appears. The driver sits behind a steering wheel with both hands on the grips. Phase 1 is single-boat, single-driver and surface-only; there is no fuel, damage, passengers or boat-to-boat collision.

## Controls

- **V** near the parked boat: board. While driving: step out. Onto land if a bank or dock is within about 4.5 m, otherwise into the water beside the boat.
- **W** throttle, **S** brake then reverse, **A / D** steer. The boat turns only while it is moving.
- **R** returns the player to their cabin and puts the boat back at the nearest dock.

## Tuning

Values live in `BOAT_TUNING` in `apps/web/src/boat-motion.ts`.

- Cruise speed 8 m/s, reverse 2 m/s.
- Acceleration 2.4 m/s², reverse acceleration 1.5 m/s², linear coast-down 0.35 m/s², brake deceleration 5 m/s².
- Maximum turn rate 0.9 rad/s (the scooter uses 1.65), reached at 3 m/s and above.
- Wheel travel 2.4 rad, hull lean at most 0.06 rad, ride height 0.75 m, bob amplitude 0.03 m.
- The hull floor never goes below `LAKE_LEVEL + 0.15` (`BOAT_FLOAT_HEIGHT` in `apps/web/src/boat-geometry.ts`).
- Bank stop: the boat probes the water 2.2 m ahead (`BOAT_PROBE_DISTANCE`) and stops when it is shallower than 0.5 m (`BOAT_MIN_DEPTH`), both in `apps/web/src/boat-placement.ts` (`boatBlockedAhead`).
- Exit candidates: sides at 1.6 m and 2.6 m, then the bow at 2.2 m and 3.2 m, then a land-only far ring of left, right and bow at 4.5 m. The first candidate whose ground lies no more than 0.4 m below the lake surface (`BOAT_WADE_DEPTH`, shallower than the 0.62 m swim threshold) becomes the exit, so the driver wades rather than swims. If none qualifies, the driver enters the water beside the boat at the first (1.6 m) candidate.

## Wheel and hands

Wheel angle is `clamp(turnRate / maxTurnRate) × 2.4 rad`. A positive value is a left turn and reads counter-clockwise to the driver. Two-bone arm IK (`apps/web/src/limb-ik.ts`) places each hand on its wheel grip every frame, so the hands follow the wheel through the turn.

## Multiplayer

The existing pose carries `vehicle: "boat"`; no new message type is added. A remote client infers the wheel angle from the driver's yaw rate. Clients that have not reloaded show the driver as a seated avatar with no boat. Deploy the la-baraj-world Worker before merging to main: an old Worker rejects `vehicle: "boat"` as an invalid packet and disconnects a boating player after three strikes (about half a second at 7 Hz). This is a blocking release step.

## Known limits

- A parked boat is visible only to its owner. Other players see a boat once it is driven.
- Boat position is not persisted; it resets to the dock on reload.
- The north shore terrain is a proxy, so boat-to-bank behaviour there is approximate.
- Remote players and remote boats were not verified: the run was offline and the production Worker was not contacted.
- At a gentle bank the boat stops in water that is still about 0.67 m deep, about 5 m from the shoreline. The exit reach now extends to 4.5 m and wadeable shallows up to 0.4 m deep count as ground, so V at a shallows stop wades ashore on gentle banks. North-shore crossing: see Browser verification item 7.
- Dev-mode verification is blocked by a bug that predates the boats. `React.StrictMode` runs effects twice, and the cleanup at `apps/web/src/NearbySolids.tsx:38` calls `isValid()` on a Rapier world that is already freed. The error is "null pointer passed to rust" and the scene boundary shows "The lake couldn't load". It reproduces on the base commit (6d6e3d8) as well as this branch.

## Browser verification

Because dev mode cannot load the scene, the run used the production bundle: `VITE_GAME_DIAGNOSTICS=1 npm run build`, then one `npm run preview` on 127.0.0.1:4173, offline with no room server. Playwright Chromium at 1280 x 720, synthetic `KeyboardEvent`s on `window`, telemetry from the `movement-metrics` output. The player's home is cabin 1; the central dock is at x = 0 and the boat spawns at (3.2, 0.05, 46.9), yaw pi.

1. Boarding. Swimming up to the parked boat shows "Drive the motorboat / W throttle . A/D steer . V step out" within 3.5 m. V boards from the water: vehicle "Motorboat", animation `Activity_Sit`, body at (3.2, 0.79, 46.9), y settling 0.80 to 0.77 with no upward pop. The driving hint reads "Motorboat / V near a bank to step out".
2. Throttle and turning. W takes the boat from 0 to 8 m/s in about 3.5 s (2.24, 4.76, 6.92, 8.0 at 1 s steps) and holds 8.0. A while moving increases yaw (left turn), ramping toward 0.9 rad/s. The wheel turns, both hands stay on the grips, the hull leans and a wake ring shows. After releasing W the boat coasts 8.00, 7.69, 7.32, 6.96, 6.64 m/s over 4 s (0.35 m/s^2, linear).
3. South bank at full throttle. Before commit 48e95a5 the boat crossed the shoreline (`inWater` false from z about 87.9, body y 0.83 to 1.81) and stopped about 4 m inland. V then parked the hull under the bank and re-boarding left the body inside terrain until R. After the fix the boat stops at (-8.7, 0.8, 59.5) still in water, y steady at 0.78 to 0.83, speed 8 to 0 within one frame, with no climb and no jitter. S reverses away at -2 m/s; W drives back and stops at the same spot.
4. Exit at the bank and at the dock. V at the bank stop dropped the driver into the water; this run predates the 4.5 m far exit ring. V at the dock boat steps onto the deck at (1.6, 1.98, 46.9), grounded.
5. Mid-lake exit. V at (3.2, -16.5) at 7.4 m/s: the driver swims 1.6 m to port of the boat (`Swim_Idle`, y settles to 0.55, vehicle null) and the re-board prompt shows. V again re-boards from the water.
6. Return. R from anywhere, including the stranded pre-fix state, puts the player at the home spawn (55.4, 6.05, 63.8) and the boat back at the dock spawn, confirmed by boarding there again.

Console in the preview session: 0 errors and 2 existing warnings (THREE.Clock deprecation; Rapier "deprecated parameters for the initialization function"). A favicon.ico 404 appears only in dev.

## Observed issues

- Fixed during verification: the boat could cross the shoreline at full throttle and strand the player in terrain (fix 48e95a5).
- Changed after verification, browser re-run pending: the gentle-bank exit now has a 4.5 m far exit ring and wades ashore in water up to 0.4 m deep (see Known limits).
- Open: dev-mode scene load fails because of the StrictMode and Rapier cleanup bug, unrelated to the boats.

## Captures

- `captures/boat-prompt.png`: swimmer beside the parked boat with the boarding prompt.
- `captures/boat-turning.png`: wheel turned with both hands on the grips, hull leaning, wake ring.
- `captures/boat-beached.png`: boat stopped at the south bank, still in water (after the fix).
- `captures/boat-swim-exit.png`: driver swimming beside the boat after a mid-lake exit, with the re-board prompt.
