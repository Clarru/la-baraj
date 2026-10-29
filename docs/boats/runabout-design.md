# Classic runabout: design

Date: 30 October 2026. Branch: `boats`. Replaces the Phase 1 placeholder motorboat (`boat-geometry.ts`, 3.6 m, built from primitives in code).

## Why

The owner's verdict on the Phase 1 boat: it "looks very rough and unfinished". They want something nicer, in the spirit of the Clarion Twenty, a 20 ft varnished-wood Muskoka runabout, and they care specifically about **the level of detail**. Driving behaviour is already accepted; this is a visual upgrade of the boat itself.

Reference: the throwaway concept renders in `docs/art-direction/runabout/` (`concept-three-quarter.png`, `concept-cockpit.png`, `concept-side.png`). The owner accepted that concept as the direction, together with the fixes listed under "Required corrections to the concept".

## Goals

- A full-size classic runabout, about **6.1 m (20 ft) long and 2.2 m in beam, with six seats**, which a player reads at a glance as a beautiful varnished-wood boat.
- Detail at the level of the concept or above: a curved hull, varnished mahogany with visible grain, planked decks with pale seams, chrome hardware, tufted leather seats and a real dashboard.
- Keep everything Phase 1 already does: boarding, driving, the wheel turning with the boat's turn rate, hands on the grips, lean, stepping out at any bank, the remote view and the wake.
- It must still run smoothly in a browser with up to 30 players.

## Non-goals

- Passengers. The six seats are for looks and future Phase 3; only the driver sits in this change.
- Changes to tuning, controls, protocol or the server. The 8 m/s cruise, steering feel, `vehicle: "boat"` and pose traffic all stay as they are.
- New sounds, damage or fuel.

## Anti-goals (would count as failure even if it technically works)

- Copying the Clarion: no Clarion name, logo or exact lines, and nothing taken from the paid CGTrader model (its license forbids AI use). This is an original boat in the classic-runabout genre.
- A boat that looks great in Blender but flat or grey in the game, because chrome and varnish have nothing to reflect.
- A frame-rate or download hit noticeably worse than a cabin.
- Hands that leave the wheel, or a wheel that no longer turns with the boat.

## The boat (owner-approved direction)

From the concept, plus the corrections below:

- **Hull:** long, low and sleek, with sheer rising toward the bow, a sharp curved bow and a rounded transom. Glossy varnished mahogany topsides with visible grain, a cream boot stripe at the waterline and dark red-brown bottom paint below it.
- **Decks:** a foredeck and a stern deck in mahogany planks with pale seams that follow the deck's curve, with a centre king plank.
- **Chrome:** rub rails along both gunwales, cleats (two forward, two aft), a bow light, engine-hatch vents on the stern deck and a stern flagstaff with a small red pennant.
- **Cockpit:** a mahogany coaming around the opening and a dark floor. Two rows of cream, button-tufted leather seats: a rear bench for three and a front row for three, with the driver on the right.
- **Helm:** a varnished wooden dashboard with three chrome-ringed gauges, and an ivory-rimmed, chrome-spoked wheel on a short chrome column, on the right (starboard) side as seen by the driver.
- **Windshield:** raked and wrap-around, in a chrome frame with corner posts and a centre bar.
- **Engine:** inboard under the stern deck, with no outboard motor.

### Required corrections to the concept

1. The bow must be a sharp, curved runabout bow, not the concept's blunt box.
2. No dark marks or interior parts may show through the hull.
3. The seats need visible tufting buttons and seams.
4. The windshield needs more presence: a framed, slightly tinted glass with chrome posts.
5. Add a chrome cutwater strip along the bow edge, from the foredeck to the waterline, and the stern pennant.

## How it is made (decided)

- **A Blender script is the source of truth**, as for the cabins: `scripts/build-runabout.py`, run headless with `Blender --background --python scripts/build-runabout.py` on Blender 5.2. It writes the editable `assets/blender/Runabout.blend` (git-ignored like the other large sources), a preview render `docs/art-direction/runabout/runabout-blender.png`, and a raw GLB.
- **Optimization** follows `scripts/optimize-cabins.mjs`: a `scripts/optimize-runabout.mjs` using gltf-transform (dedup, prune, WebP texture compression), writing `apps/web/public/assets/optimized/Lake_Runabout.glb` plus a size and bounds record. It loads through the existing `assetUrl()`/`useGLTF` path.
- **Procedural materials are baked** into textures (base colour, roughness and normal where it helps) for the wood, deck seams and leather, because glTF can't carry Blender node setups. Varnish uses glTF clearcoat (`KHR_materials_clearcoat`), which three.js supports.
- **Reflections:** the game scene has no environment map. Give only the boat's materials a small generated environment map, a simple sky/water gradient through PMREM, built once and shared. Don't change the global scene environment, which would alter the look of the whole world. *My call:* the map's strength (`envMapIntensity`) follows the day/night brightness from `day-night.ts`, so chrome doesn't glow at night. Materials stay shared, and one per-frame hook updates them all.
- **Budget:** at most about **1 MB** for the optimized GLB (cabins are 0.55–1.1 MB) and about **60k triangles** for the detailed boat. Texture maps at most 2048 px and normally 1024 px. *My call:* the same script also exports a simplified remote version (`Lake_Runabout_LOD`, about 8k triangles, sharing the textures, without the stitching, buttons or gauge detail) that casts no shadows. Other players' boats use it, so 30 boats on screen stay affordable. The player's own boat, and the parked boat, use the detailed model.
- **Provenance:** add an original-geometry entry to `apps/web/public/assets/CREDITS.md` and `source-manifest.json` in the style of the cabin entries. The spike script used for the concept is throwaway and not committed.

## Contract with the game code (decided)

The GLB must provide these named nodes, so the existing driving and remote code keeps working:

- `SteeringWheel`: the tilted wheel pivot. Its child `WheelSpin` carries the rim and spokes and spins about its local Z (today's `setBoatWheelAngle` convention: positive turn rate turns it counter-clockwise as seen by the driver).
- `Grip_L` and `Grip_R`: empties under `WheelSpin` on the rim. `BoatHandle.gripWorldPosition` reads them, replacing the hard-coded `BOAT_METRICS.grips`.
- `DriverSeat`: an empty at floor level under the driver's hips, facing forward.
- `Seat_0` … `Seat_5`: empties for the six seat positions, for Phase 3 passengers. Unused for now.
- In glTF axes the bow points +Z with +Y up, matching the game's forward convention.

`boat-geometry.ts`'s procedural hull is removed, and `BOAT_METRICS` shrinks to what the code still needs: length, beam and seat height, read from or checked against the GLB.

*My call on the turning pivot:* while driving, the physics capsule sits at the hull's turning point, on the centreline about 40% of the length forward of the transom, not under the driver. The character is drawn at `DriverSeat`, offset from the capsule. The boat then turns about its own pivot instead of swinging around the driver in the right-hand seat, and probe, exit and spawn geometry stays symmetric. Published pose position and yaw for a boater mean the boat's pivot on the water. Remote clients place the hull there and the driver at the same seat offset. There's no protocol change: `position` is still the world-space root the remote renders from. Tuning is unchanged.

## Knock-on changes in the game (decided: they must happen)

The boat grows from 3.6 × 1.4 m to about 6.1 × 2.2 m. Everything that assumed the small boat must be re-derived from the new size:

- **Parked collider** in `ParkedBoat`: fit it to the new hull.
- **Driving collision:** today only the driver's capsule collides, so a long bow would pass through docks and pilings. While driving, the boat needs a hull-sized collider that moves with the player, sitting above the lakebed so it doesn't drag in deep water. *My call:* collision is local only, as with the scooter today. Your own boat is solid to the world around it, while other players' boats are drawn but not solid. Phase 1 already excludes boat-to-boat collision.
- **Shallows stop:** `BOAT_PROBE_DISTANCE` (2.2 m) must reach past the new bow.
- **Exit spots:** `boatExitCandidates` distances must clear the wider beam and longer bow.
- **Dock spawn:** `BOAT_DOCK_SIDE_OFFSET` (3.2 m) and `BOAT_DOCK_LAKE_OFFSET` (11 m) must clear the dock (half-width 1.7 m) and keep enough depth for the longer hull. The existing depth test must still pass.
- **Boarding distance:** `BOAT_BOARD_DISTANCE` (3.5 m) is measured to the boat origin, and must still feel right along a 6 m hull.
- **Seat height and arm IK:** re-check `Activity_Sit` against the new seat height, and the arm IK poles against the new wheel position.
- **Wake:** scale `SwimWake` to the longer hull.
- **Camera:** pull back while boating only if the boat doesn't fit the view.
- **Remote rendering:** remote boats must use the same GLB.

## Left to the builder

- Exact hull lines, plank widths, the seam pattern, the tufting layout and gauge faces, within the look above.
- The geometry technique (lofting, modifiers, bevels) and the bake setup.
- The origin choice (see the contract above), the collider shapes and the new numeric offsets, each with a test where a test exists today.
- The exact clearcoat, roughness and environment-map values, judged in the game's real lighting.

## Done means

- Screenshots in the game, saved to `docs/boats/captures/`, show the new runabout parked by the dock, driving with the wheel turned and hands on it, and a close, high view into the cockpit taken with the existing camera, zoomed in. No new camera mode. A Blender preview render sits in `docs/art-direction/runabout/`.
- The optimized GLB is within budget.
- All existing tests pass, updated where sizes changed. `npx tsc --noEmit`, `npm test`, `npm run test:protocol`, `npm run server:check` and `npm run build` are clean.
- In the browser, the Phase 1 acceptance path still holds: board, drive, turn, stop at a bank, step out at a bank and mid-lake, and R back to the dock.
