# Classic Runabout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder 3.6 m procedural motorboat with an original, detailed 6.1 m varnished-mahogany runabout built in Blender, keeping every Phase 1 driving behaviour.

**Architecture:** A headless Blender script builds the boat and bakes its materials, then exports a detailed GLB and a light LOD GLB, which gltf-transform optimizes into `apps/web/public/assets/optimized/`. The runtime loads them through `useGLTF` and reads named nodes (wheel, grips, seats). While driving, the physics capsule sits at the hull's pivot and the character is drawn offset at `DriverSeat`. Docks and pilings are detected by casting a yaw-oriented hull box along the boat's motion, because the player's body has locked rotations and cannot carry an oriented collider.

**Tech Stack:** Blender 5.2.3 Python (headless), @gltf-transform 4.5 + sharp, three.js 0.186 / React Three Fiber / Drei `useGLTF`, @react-three/rapier (Rapier `castShape`), Vitest.

**Spec:** `docs/boats/runabout-design.md` (owner-approved 30 October 2026). Concept: `docs/art-direction/runabout/concept-*.png`. Background: `docs/boats/README.md`, `docs/boats/phase-1-plan.md`.

## Global Constraints

- Work in `/Users/george2/repos/la-baraj-worktrees/boats`. Every shell starts with `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`. Blender is at `/Applications/Blender.app/Contents/MacOS/Blender`.
- Commits use the worktree identity (`georgeab550 <159116107+georgeab550@users.noreply.github.com>`), explicit paths only, and no Claude trailers. No pushes, PRs or merges.
- Original design: no Clarion name, logo or exact lines, and nothing from the CGTrader model.
- Size: about **6.1 m long and 2.2 m in beam, with six seats** (rear bench of three, front row of three), the driver on the right (starboard) as seen from the driver's seat.
- Budget: detailed GLB **≤ 1 MB (1,048,576 bytes)** and **≤ 60,000 triangles**. LOD GLB **≤ 8,000 triangles**, sharing the textures. Textures ≤ 2048 px, normally 1024 px, as WebP.
- No changes to tuning (`BOAT_TUNING`), controls, protocol, server or pose cadence.
- Do not change the global scene environment. Only boat materials get the generated environment map.
- Collision is local only. Remote boats are drawn but not solid.
- glTF axes: the bow points **+Z** and **+Y** is up. As in the game, at yaw 0 the driver's left is **+X**, so starboard (the driver's right) is **−X**.
- **Origin:** the GLB origin is on the waterline (y = 0 is the lake surface) on the centreline, at the turning pivot **40% of the hull length forward of the transom**.
- Required GLB nodes (exact names): `SteeringWheel` (tilted pivot) → child `WheelSpin` (rim and spokes, spins about local Z) → children `Grip_L`, `Grip_R`; `DriverSeat` (empty at cockpit-floor height under the driver's hips, facing +Z); `Seat_0` … `Seat_5`.
- After every task: `npx tsc --noEmit` and `npm test` pass. Tasks 3–4 also run `npm run test:protocol`, `npm run server:check` and `npm run build`.
- The only local server is in Task 5, under the AGENTS.md rules: check port 4173 and use one `npm run preview` of a `VITE_GAME_DIAGNOSTICS=1 npm run build`. `npm run dev` fails on this machine because of a known StrictMode/Rapier bug, the same on `main`.

## Review Focus

1. **The boat looks flat or grey in the game even though Blender looks right.** The environment map must actually reach the materials, and clearcoat must survive export and optimization. Task 2's test asserts the boat materials carry `envMap` and that `clearcoat > 0` survives on the varnish material. Task 5 captures in-game shots at day and at dusk.
2. **Night:** chrome must not glow. Task 2 tests `boatEnvironmentIntensity` against night and noon `Lighting` values.
3. **The long bow passing through a dock or piling** at full throttle. Task 3's Rapier test casts the hull at a piling ahead and diagonally ahead.
4. **The hands leaving the wheel after the seat offset.** Task 3's test drives `createBoatRiderRig` with grips read from the loaded GLB at several wheel angles, with the character offset to `DriverSeat`.
5. **Exits or the dock spawn inside the bigger hull.** Task 3 tests that every exit candidate lies at least 0.5 m outside the oriented hull rectangle, and that the dock spawn's whole footprint is in water at least 0.6 m deep and clear of the dock by at least 0.5 m.

---

### Task 1: Blender runabout, optimized GLBs and asset contract

**Files:**
- Create: `scripts/build-runabout.py`, `scripts/optimize-runabout.mjs`, `apps/web/src/runabout-asset.test.ts`
- Create (generated, committed): `apps/web/public/assets/optimized/Lake_Runabout.glb`, `apps/web/public/assets/optimized/Lake_Runabout_LOD.glb`, `apps/web/public/assets/runabout-library.json`, `docs/art-direction/runabout/runabout-blender.png`, `docs/art-direction/runabout/runabout-blender-cockpit.png`
- Generated, git-ignored: `assets/blender/Runabout.blend`, `assets/house-source/Lake_Runabout.glb`, `assets/house-source/Lake_Runabout_LOD.glb`
- Modify: `apps/web/public/assets/CREDITS.md`, `apps/web/public/assets/source-manifest.json`

**Interfaces:**
- Produces: the two optimized GLBs with the node contract from Global Constraints; `runabout-library.json` = `{ models: [{ id, bytes, triangles, bounds: { min: [x,y,z], max: [x,y,z] }, source }] }` for `Lake_Runabout` and `Lake_Runabout_LOD`. The materials named `Varnish` (hull/coaming wood), `DeckPlanks`, `Chrome`, `Leather`, `Glass`, `Ivory`, `BottomPaint`, `BootStripe` exist in both files (the LOD may merge leather tufting into `Leather`).

- [ ] **Step 1: Write the failing test** `apps/web/src/runabout-asset.test.ts`, reading both files with `NodeIO` plus `ALL_EXTENSIONS` (as `scripts/optimize-cabins.mjs` does):
  - `"detailed runabout stays within the download and triangle budget"`: file bytes ≤ 1,048,576; triangle count (sum of index count / 3 over all primitives) ≤ 60,000 and ≥ 15,000, which guards against a placeholder.
  - `"LOD runabout is light and shares the look"`: triangles ≤ 8,000; same material names as the detailed file except tufting.
  - `"is a full-size runabout pointing +Z with the origin at the waterline pivot"`: bounds length (Z) 6.1 ± 0.2, beam (X) 2.2 ± 0.15; min Y between −0.55 and −0.25 (draft); max Z ≈ +0.6 × length (± 0.15) and min Z ≈ −0.4 × length (± 0.15).
  - `"exposes the steering and seating nodes"`: every required node name exists; `Grip_L`/`Grip_R` are descendants of `WheelSpin`, which is a child of `SteeringWheel`; `Grip_L` world X > `Grip_R` world X; `DriverSeat` world X < −0.2 (starboard) and its Z is within ±1.2 m of the origin; `Seat_0..5` are six distinct positions.
  - `"varnish keeps its clearcoat"`: the `Varnish` material has `KHR_materials_clearcoat` with factor ≥ 0.5; `Chrome` metallic ≥ 0.9 and roughness ≤ 0.2.
  - `"textures stay within 2048 px"`: every texture's image is WebP and ≤ 2048 px on its longer side (read the WebP header dimensions, or use `sharp(buffer).metadata()`).
- [ ] **Step 2: Run** `npx vitest run apps/web/src/runabout-asset.test.ts` — expect FAIL (files missing).
- [ ] **Step 3: Write `scripts/build-runabout.py`.** Start from the owner-accepted concept in `docs/art-direction/runabout/` and the hull-lofting approach of the throwaway concept: stations along the length, a V-bottom to chine to flared topsides, solidified. Then apply every "Required correction" from the design:
  1. a sharp curved bow with a raked stem;
  2. nothing showing through the hull, with cockpit parts clipped to the inner hull;
  3. visible tufting buttons and seams on the seats;
  4. a framed, slightly tinted windshield with chrome corner posts and a centre bar;
  5. a chrome cutwater from the foredeck to the waterline, and a red stern pennant.
  The engine is inboard: vents on the stern deck, no outboard. Bake the wood grain, plank seams and leather to textures (normally 1024 px). Export glTF with clearcoat on `Varnish`. Build the LOD by decimating and dropping the tufting, buttons and gauge glass. Name the nodes exactly as in the contract and place the origin as in Global Constraints. Render `runabout-blender.png` (three-quarter view) and `runabout-blender-cockpit.png` (cockpit, wheel visible). Write the `.blend` and the two raw GLBs to the ignored paths. Run with `Blender --background --python scripts/build-runabout.py`.
- [ ] **Step 4: Write `scripts/optimize-runabout.mjs`** following `scripts/optimize-cabins.mjs`: dedup, prune, `textureCompress` to WebP; write both optimized GLBs and `runabout-library.json` with bytes, triangles, bounds and source. Run with `node scripts/optimize-runabout.mjs`.
- [ ] **Step 5: Look at both renders.** Check them against the five corrections and the concept. If any correction isn't visibly met, fix the script and re-run Steps 3–4. Record what you checked in the task report.
- [ ] **Step 6: Run** the asset test — PASS. Run `npm test` and `npx tsc --noEmit`.
- [ ] **Step 7: Add provenance:** a `CREDITS.md` paragraph ("The Lake_Runabout and Lake_Runabout_LOD models are original project geometry built in Blender with scripts/build-runabout.py … no third-party mesh is used") and a `source-manifest.json` entry in the style of the cabin entries.
- [ ] **Step 8: Commit** the scripts, the test, the generated committed files and the provenance edits: `git commit -m "Build the classic runabout in Blender"`.

---

### Task 2: Runtime runabout component and boat-only reflections

**Files:**
- Create: `apps/web/src/boat-environment.ts`, `apps/web/src/boat-environment.test.ts`, `apps/web/src/runabout-rig.test.ts`
- Modify: `apps/web/src/boat-geometry.ts` (remove the procedural hull; keep the `setBoatWheelAngle`/`applyBoatLean` semantics), `apps/web/src/boat-resources.ts`, `apps/web/src/boat.tsx`, `apps/web/src/boat-geometry.test.ts` (delete the tests for removed procedural geometry; keep or adapt the wheel-sign and lean tests), `apps/web/src/Game.tsx` (wrap `ParkedBoat` in a `<Suspense fallback={null}>` and preload)

**Interfaces:**
- Consumes: the Task 1 GLBs; `Lighting` from `day-night.ts`.
- Produces:
  - `boat-geometry.ts`: `RUNABOUT_IDS = { full: "Lake_Runabout", lod: "Lake_Runabout_LOD" } as const`; `type BoatRig = { group: THREE.Object3D; wheel: THREE.Object3D; wheelSpin: THREE.Object3D; grips: Record<BoatSide, THREE.Object3D>; driverSeat: THREE.Object3D; seats: THREE.Object3D[] }`; `extractBoatRig(scene: THREE.Object3D): BoatRig`, which throws a clear `Error` naming any missing node; `setBoatWheelAngle(rig, wheelAngle)` (unchanged sign: `wheelSpin.rotation.z = −wheelAngle`); `applyBoatLean(rig, lean)` (unchanged: `group.rotation.z = −lean`); `BOAT_DIMENSIONS = { length: number; beam: number; bowExtent: number; sternExtent: number; draft: number; deckHeight: number }`, with values copied from `runabout-library.json` (bowExtent = max Z, sternExtent = −min Z, draft = −min Y, deckHeight = the foredeck top above the waterline).
  - `boat-resources.ts`: `cloneBoatRig(scene: THREE.Object3D): BoatRig` (clones the scene, shares geometry and materials, and calls `extractBoatRig`).
  - `boat-environment.ts`: `getBoatEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture` (one PMREM from a small generated sky-and-water gradient scene, cached); `boatEnvironmentIntensity(lighting: Lighting): number` (0.15 at night to 1.0 at full day, derived from `sunIntensity` and `hemiIntensity`); `applyBoatEnvironment(root: THREE.Object3D, envMap: THREE.Texture): void` (sets `envMap` on every mesh material under root).
  - `boat.tsx`: `Boat` (forwardRef, props `{ visible?: boolean; detail?: "full" | "lod" }`, default `"full"`), which loads with `useGLTF(assetUrl(RUNABOUT_IDS[detail]))`, applies the environment and updates `envMapIntensity` each frame from `currentLighting()`. The LOD sets `castShadow = false` on its meshes. `BoatHandle = { update(motion: { wheelAngle: number; lean: number }): void; gripWorldPosition(side: BoatSide, target: THREE.Vector3): THREE.Vector3; wheelNormalWorld(target: THREE.Vector3): THREE.Vector3; driverSeatLocal(target: THREE.Vector3): THREE.Vector3 }`. `ParkedBoat` keeps its props, places the boat origin at `[x, LAKE_LEVEL, z]` (no `BOAT_FLOAT_HEIGHT`; the origin is the waterline), and fits its fixed collider to `BOAT_DIMENSIONS`: a cuboid with half-extents `[beam / 2, 0.35, (bowExtent + sternExtent) / 2]`, centred at `[0, 0.25, (bowExtent − sternExtent) / 2]`. `BOAT_FLOAT_HEIGHT` is deleted.

- [ ] **Step 1: Write the failing tests:**
  - `runabout-rig.test.ts`, loading `Lake_Runabout.glb` with `GLTFLoader.parse` from the file bytes, as `boat-rider.test.ts` loads the character: `"extracts the wheel, grips and seats"` (all `BoatRig` fields defined; six seats); `"wheel turns counter-clockwise for a left turn"` (after `setBoatWheelAngle(rig, 1)`, `Grip_L` has moved toward −Y in the wheel plane relative to angle 0, the same sign the existing test pins); `"grips stay on the rim as the wheel turns"` (the distance from each grip's world position to the `SteeringWheel` world position is constant within 0.005 across angles `[0, 1.2, −2.4]`); `"fails loudly on a model missing the wheel"` (`extractBoatRig(new THREE.Group())` throws an error mentioning `SteeringWheel`); `"dimensions match the shipped asset"` (`BOAT_DIMENSIONS.length` within 0.01 of the library record's Z extent).
  - `boat-environment.test.ts`: `"chrome does not glow at night"` (`boatEnvironmentIntensity(lightingAt(1))` ≤ 0.2 and `lightingAt(12)` ≥ 0.9, with dusk `lightingAt(19.5)` strictly between them); `"applies the map to every boat material"` (after `applyBoatEnvironment` on the loaded rig, every `MeshStandardMaterial` / `MeshPhysicalMaterial` has `envMap` set, and the `Varnish` material is a `MeshPhysicalMaterial` with `clearcoat > 0`). Create the PMREM-independent part with a stand-in `THREE.Texture`; `getBoatEnvironment` itself needs a renderer and is covered in Task 5.
- [ ] **Step 2: Run** both files — FAIL.
- [ ] **Step 3: Implement** `boat-geometry.ts`, `boat-resources.ts`, `boat-environment.ts` and `boat.tsx` per the Interfaces. In `Game.tsx`, wrap `ParkedBoat` in `<Suspense fallback={null}>` and call `useGLTF.preload` for both IDs, so a slow boat download never blanks the scene.
- [ ] **Step 4: Run** the new tests and the updated `boat-geometry.test.ts` — PASS. `npx tsc --noEmit` will fail where `player.tsx` and `multiplayer-players.tsx` still import `BOAT_FLOAT_HEIGHT` or `BOAT_METRICS`. Repoint those imports to `BOAT_DIMENSIONS` with the minimal change that compiles (`LAKE_LEVEL` replaces `LAKE_LEVEL + BOAT_FLOAT_HEIGHT` as the visual origin). Task 3 does the real integration. Then run `npm test`.
- [ ] **Step 5: Commit** with `git commit -m "Load the runabout model with boat-only reflections"`.

---

### Task 3: Drive the runabout: pivot, seat offset, hull collision and placement

**Files:**
- Modify: `apps/web/src/player.tsx` (boating sections: V flow ~319-390; frame loop ~674-850; visual ~960-1000; rider update ~1098-1105; JSX ~1190-1222), `apps/web/src/boat-rider.ts` (hand orientation from a supplied world-space wheel normal instead of `BOAT_METRICS.wheelTilt`), `apps/web/src/boat-placement.ts`, `apps/web/src/boat-rider.test.ts`, `apps/web/src/boat-placement.test.ts`
- Create: `apps/web/src/boat-collision.ts`, `apps/web/src/boat-collision.test.ts`

**Interfaces:**
- Consumes: `BOAT_DIMENSIONS`, `BoatHandle` (Task 2).
- Produces:
  - `boat-rider.ts`: `update(frame: { left: THREE.Vector3; right: THREE.Vector3; wheelNormal: THREE.Vector3 }): void`.
  - `boat-collision.ts`: `boatHullBlocked(world: RAPIER.World, rapier: typeof RAPIER, input: { x: number; z: number; yaw: number; dx: number; dz: number; exclude: RAPIER.RigidBody }): boolean`. It casts a cuboid with half-extents `[beam / 2, 0.3, (bowExtent + sternExtent) / 2]`, centred `(bowExtent − sternExtent) / 2` forward of the pivot at `LAKE_LEVEL + 0.35`, rotated by yaw, along `(dx, dz)` plus a 0.3 m look-ahead. It returns true on any hit except the excluded body and sensors.
  - `boat-placement.ts` (new values derived from `BOAT_DIMENSIONS`, named constants kept): `BOAT_DOCK_SIDE_OFFSET`, `BOAT_DOCK_LAKE_OFFSET`, `BOAT_PROBE_DISTANCE` (= `bowExtent + 0.8`), `boatExitCandidates` (side points at `beam / 2 + 0.7` and `beam / 2 + 1.7`, bow points at `bowExtent + 0.7` and `bowExtent + 1.7`, the land-only ring rescaled the same way), and a new `distanceToHull(px: number, pz: number, boat: { x: number; z: number; yaw: number }): number` (distance to the oriented hull rectangle, 0 inside). `canBoardBoat` keeps its input shape; its `distance` is now `distanceToHull`, and `BOAT_BOARD_DISTANCE` becomes **1.6** (from the hull edge).

- [ ] **Step 1: Write the failing tests:**
  - `boat-collision.test.ts` (initialise `@dimforge/rapier3d-compat`, which `@react-three/rapier` already depends on; build a `World` with a fixed 0.16 × 1.3 × 0.16 m piling cuboid): `"stops before a piling dead ahead"` (boat at the origin, yaw 0, piling at `(0, 0.4, bowExtent + 0.2)`, moving `dz = 0.15` → true); `"stops on a diagonal approach"` (piling at `(beam / 2 − 0.1, 0.4, bowExtent − 0.5)`, yaw 0.3, small forward motion → true); `"open water is clear"` (no colliders nearby → false); `"ignores its own capsule"` (a dynamic capsule at the origin passed as `exclude` → false).
  - `boat-placement.test.ts`: update the existing tests to the new constants. Add `"every exit lies clear of the hull"` (for yaws `[0, 1, 2.5, −2]`, every `boatExitCandidates` point has `distanceToHull` ≥ 0.5); `"the dock boat floats clear of the dock"` (for both docks: the four hull corners and the bow tip of `boatDockSpawn` are `inWater` with depth ≥ 0.6, and the hull rectangle stays ≥ 0.5 m from the dock deck rectangle at `x ± 1.7`); `"boarding works along the whole hull"` (a player 1.0 m off the stern corner and 1.0 m off the bow are both within `BOAT_BOARD_DISTANCE` via `distanceToHull`; at 2.0 m off the side they are not).
  - `boat-rider.test.ts`: change the frame to include `wheelNormal`. Add `"hands stay on the runabout grips from the driver seat"`: load the runabout GLB and the character, place the character at the `DriverSeat` position (the boat parent at the origin), and for wheel angles `[0, 1.2, −2.4]` each hand is within 0.05 m of `gripWorldPosition`.
- [ ] **Step 2: Run** the three files — FAIL.
- [ ] **Step 3: Implement `boat-collision.ts`, the placement changes and the rider normal.** Run the three files — PASS.
- [ ] **Step 4: Integrate in `player.tsx`:**
  - Boarding uses `distanceToHull(playerPosition.x, playerPosition.z, parked)`, and so does the boat hint.
  - On boarding, teleport the body to the parked origin (the pivot) at `LAKE_LEVEL + BOAT_TUNING.rideHeight`, unchanged.
  - Each boating frame, after computing the boat velocity, call `boatHullBlocked` with this frame's displacement (velocity × dt). If blocked, zero the horizontal velocity and let `reconcileBoatSpeed` drop the commanded speed, alongside the existing `boatBlockedAhead`.
  - Visual: the visual group's origin is the boat origin at `LAKE_LEVEL − playerViewPosition.y` (was `+ BOAT_FLOAT_HEIGHT`). While boating, position the character `object` at `boat.current.driverSeatLocal(...)`, and reset it to the origin when boating ends (exit, R reset, unmount).
  - Rider: pass `wheelNormal: boat.current.wheelNormalWorld(scratch)`.
  - Wake: `<SwimWake scale={…}>` sized to the hull (≈ `BOAT_DIMENSIONS.length / 1.4`), centred on the hull midpoint, not the pivot.
  - Exits: unchanged logic with the new candidates.
- [ ] **Step 5: Verify** `npx tsc --noEmit`, `npm test`, `npm run test:protocol`, `npm run server:check`, `npm run build`.
- [ ] **Step 6: Commit** the modified and created files: `git commit -m "Drive the full-size runabout with hull collision"`.

---

### Task 4: Other players' runabouts

**Files:**
- Modify: `apps/web/src/multiplayer-players.tsx` (boat helpers ~112-160, frame ~194-330, JSX ~355-360)
- Test: `apps/web/src/multiplayer-players.test.tsx` if a matching harness exists; otherwise put the pure seat-offset helper in `boat-geometry.ts` and test it there.

**Interfaces:**
- Consumes: `Boat` with `detail="lod"`, `BoatHandle`, `createBoatRiderRig` with `wheelNormal` (Tasks 2–3).
- Produces: `remoteDriverOffset(rig: BoatRig, target: THREE.Vector3): THREE.Vector3` in `boat-geometry.ts` (the `DriverSeat` position in boat-local space). Task 3's `driverSeatLocal` may delegate to it.

- [ ] **Step 1: Write the failing test** `"remote drivers sit in the starboard seat"`: with the LOD GLB rig, `remoteDriverOffset` returns X < −0.2 and matches the full rig's `DriverSeat` within 0.02 m (the LOD keeps the same seat nodes).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**:
  - the remote `<Boat detail="lod">` wrapped in `<Suspense fallback={null}>`;
  - the avatar offset to the driver seat while boating and reset afterwards;
  - the rider fed `wheelNormal`;
  - the wake sized and centred as in Task 3;
  - remote pose position treated as the boat pivot. It already is, because the local player publishes the capsule/visual root.
- [ ] **Step 4: Verify** `npx tsc --noEmit`, `npm test`, `npm run test:protocol`, `npm run server:check`, `npm run build`.
- [ ] **Step 5: Commit** with `git commit -m "Show other players in the runabout"`.

---

### Task 5: In-game verification, captures and docs

**Files:**
- Create: `docs/boats/captures/runabout-parked.png`, `runabout-turning.png`, `runabout-cockpit.png`, `runabout-dusk.png`
- Modify: `docs/boats/README.md` (the boat section, sizes, offsets, budget and captures), `docs/boats/runabout-design.md` (append a short "Built" note with the final numbers)

- [ ] **Step 1: Serve** following Global Constraints: `lsof -nP -iTCP:4173 -sTCP:LISTEN`. If 4173 is free, run `VITE_GAME_DIAGNOSTICS=1 npm run build`, then one `npm run preview`. If it's occupied, stop and report.
- [ ] **Step 2: Drive with Playwright** at `http://127.0.0.1:4173/`. Hold keys by dispatching `keydown`/`keyup` events on `window` via `browser_evaluate` (`browser_press_key` cannot hold keys). Read the live sample from `output[data-testid="movement-metrics"]` `data-motion`. Steps:
  1. Confirm a name, then walk to the west dock and screenshot the parked runabout (`runabout-parked.png`).
  2. Board, check the hint, then drive: W for 6 s, A for 2 s. Screenshot the turn with the wheel turned and hands on it (`runabout-turning.png`).
  3. Zoom the camera into the cockpit and screenshot it (`runabout-cockpit.png`).
  4. Drive at the dock pilings at full throttle and confirm the bow stops without passing through.
  5. Stop at a bank, step out, re-board, step out mid-lake into swimming, then press R and confirm the boat is back at the dock.
  6. If the diagnostics expose a time override, capture a dusk view (`runabout-dusk.png`); otherwise note that it wasn't possible.
  7. Record console errors, expecting zero. Also record frame time with the boat on screen, compared with walking at the same spot.
- [ ] **Step 3: Stop** only the preview process you started.
- [ ] **Step 4: Update the docs** with the observed numbers and the captures.
- [ ] **Step 5: Commit** `git add docs/boats && git commit -m "Record the runabout in the game"`.
