# Personal motorboats in La Baraj

Phase 1 gives every player a personal motorboat on Lake Cinciș. The boat starts parked beside the dock nearest the player's cabin, about 3.2 m east of the dock centreline and 11 m out from the shoreline, facing the open lake. Within 3.5 m of it (on land, on the dock or in the water) the prompt "Drive the motorboat" appears. The driver sits behind a steering wheel with both hands on the grips. Phase 1 is single-boat, single-driver and surface-only; there is no fuel, damage, passengers or boat-to-boat collision.

## Controls

- **V** near the parked boat: board. While driving: step out. Onto land if a bank or dock is within about 3 m, otherwise into the water beside the boat.
- **W** throttle, **S** brake then reverse, **A / D** steer. The boat turns only while it is moving.
- **R** returns the player to their cabin and puts the boat back at the nearest dock.

## Tuning

Values live in `BOAT_TUNING` in `apps/web/src/boat-motion.ts`.

- Cruise speed 8 m/s, reverse 2 m/s.
- Acceleration 2.4 m/s², reverse acceleration 1.5 m/s², linear coast-down 0.35 m/s², brake deceleration 5 m/s².
- Maximum turn rate 0.9 rad/s (the scooter uses 1.65), reached at 3 m/s and above.
- Wheel travel 2.4 rad, hull lean at most 0.06 rad, ride height 0.75 m, bob amplitude 0.03 m.
- The hull floor never goes below `LAKE_LEVEL + 0.15`.

## Wheel and hands

Wheel angle is `clamp(turnRate / maxTurnRate) × 2.4 rad`. A positive value is a left turn and reads counter-clockwise to the driver. Two-bone arm IK (`apps/web/src/limb-ik.ts`) places each hand on its wheel grip every frame, so the hands follow the wheel through the turn.

## Multiplayer

The existing pose carries `vehicle: "boat"`; no new message type is added. A remote client infers the wheel angle from the driver's yaw rate. Clients that have not reloaded show the driver as a seated avatar with no boat. Deploy the Worker before the frontend so the new `vehicle` value is accepted when the first updated client connects.

## Known limits

- A parked boat is visible only to its owner. Other players see a boat once it is driven.
- Boat position is not persisted; it resets to the dock on reload.
- The north shore terrain is a proxy, so boat-to-bank behaviour there is approximate.
- Remote boats were not browser-verified. This run was offline.

## Browser verification

Not completed. The dev server started on 127.0.0.1:4173 in offline mode (no `VITE_ROOM_SERVER_URL`), but every load of the scene failed in a Chromium session driven by Playwright at 1280 × 720. After the name was confirmed, the screen showed "The lake couldn't load. null pointer passed to rust" and the canvas never mounted, so no telemetry was available and none of the acceptance steps ran: board, turning with hands on the wheel, driving into the south bank, stepping out on land, mid-lake exit, return with R.

Three loads (a fresh load, "Try again", and a second reload) behaved the same. The error is thrown by `GI.isValid` from `apps/web/src/NearbySolids.tsx:38`, the cleanup of the effect that creates the fixed rigid body. It calls `body.current?.isValid()` on a Rapier world that has already been freed. That file is not modified on this branch (last changed in #16), so the crash may predate the boat work or come from React StrictMode's double effect run in dev. This was not checked against the base branch.

Console errors seen: the same "null pointer passed to rust" error on every load (repeated), plus a 404 for `/favicon.ico`.

## Observed issues

- The scene fails to load in dev under Playwright Chromium (see above). Needs investigation before the acceptance path can be run.

## Captures

None. `captures/boat-turning.png`, `captures/boat-beached.png` and `captures/boat-swim-exit.png` were not produced.
