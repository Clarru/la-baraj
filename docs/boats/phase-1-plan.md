# Personal Motorboat (Boats Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each player can take their own motorboat from a southern dock, drive it anywhere on Lake Cinciș with a steering wheel that turns with the boat, step out at any bank, and be seen driving by friends.

**Architecture:** Boating is a fourth locomotion mode in `player.tsx`, built like swimming: Ecctrl is disabled, gravity is 0 and the capsule's velocity is set every frame from a pure boat motion model (`boat-motion.ts`). The boat mesh is original procedural geometry (like the QuickVolt scooter) with a separately pivoted steering wheel; the seated driver plays `Activity_Sit` and an arm IK pass keeps both hands on the wheel grips. Multiplayer reuses the existing pose stream with a new `vehicle: "boat"` value; remote clients infer the wheel angle from the driver's yaw rate, so no new fields or messages are sent.

**Tech Stack:** React 19, TypeScript, Three.js / React Three Fiber, Rapier + Ecctrl, Vitest, PartyServer protocol in `packages/shared`.

**Spec:** `docs/PRD.md` §7.6 "Boats, confirmed 29 October 2026" (phase 1 only). Background: `docs/swimming/README.md`, `docs/LIVE_MULTIPLAYER.md`.

## Global Constraints

- Run every command from `/Users/george2/repos/la-baraj-worktrees/boats` with Node 24: prefix shells with `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- Do not start any server except as described in Task 7; never contact the production Worker or the production world.
- Commit with the worktree's configured identity (`git var GIT_AUTHOR_IDENT` must print `georgeab550 <159116107+georgeab550@users.noreply.github.com>`). Stage explicit paths only. No Claude trailers.
- Player-facing name is **La Baraj**; the location is **Lake Cinciș**. English UI copy.
- Tuning values (spec, initial): cruise **8 m/s**, long coast on throttle release, turn slower than the scooter (scooter: 1.65 rad/s), gentle reverse on S.
- Boats float at the surface using the swim float approach, never rigid-body hydrodynamics. They stop on shallows, banks and dock pilings and cannot leave the water.
- Boarding is blocked while carrying/holding an activity; while boating, E/F activities, Q punch and jumping are disabled, and the driver cannot be seated by activities.
- Pose traffic stays within existing limits: no new message types, no extra publish cadence (existing 7 Hz sampling).
- Match surrounding code style: Prettier defaults, terse JSDoc one-liners, `as const` tuning objects, pure functions that guard non-finite input and clamp `dt` to ≤ 0.05–0.1.
- After each task: `npx tsc --noEmit` and `npm test` pass. Tasks 6+ also run `npm run test:protocol` and `npm run server:check`.

## Review Focus

1. **Full-throttle into a bank or dock:** the boat stops at the shoreline without climbing onto land, launching, jittering or sinking (Task 1 `reconcileBoatSpeed`, Task 1 float is not ground-clamped; Task 5 test of `boatVelocity` against a blocked measurement).
2. **V pressed mid-lake with no land in reach:** the driver drops into swimming beside the boat, which parks floating; V again while swimming within reach re-boards (Task 2 `chooseBoatExit` returns `{ kind: "water" }`; Task 2 `canBoardBoat` allows `swimming: true`).
3. **Boat stranded or page reloaded:** the boat starts at, and R ("return outside your cabin") returns it to, the dock nearest the player's home arrival (Task 2 `nearestDockSpawn`; Task 5 wires R).
4. **Yaw wraparound for remote inference:** a remote boat crossing yaw ±π must not spin its wheel (Task 1 `inferBoatTurnRate` wraps the delta; test at 3.13 → −3.13).
5. **Scooter/boat exclusivity:** you cannot board the boat while on the scooter or vice versa; the parked scooter stays put while boating; activities refuse to start while boating (Task 2 `canBoardBoat`; Task 5 `activities.tsx` guard).

---

### Task 1: Boat motion model

**Files:**
- Create: `apps/web/src/boat-motion.ts`
- Test: `apps/web/src/boat-motion.test.ts`

**Interfaces:**
- Consumes: `LAKE_LEVEL` from `swim-motion.ts`.
- Produces:
  - `BOAT_TUNING = { cruise: 8, reverse: 2, accel: 2.4, reverseAccel: 1.5, coastRate: 0.35, brakeDecel: 5, maxTurnRate: 0.9, fullTurnSpeed: 3, wheelMaxAngle: 2.4, leanMax: 0.06, rideHeight: 0.75, bobAmplitude: 0.03 } as const` (rad, m, s).
  - `type BoatMotionState = { yaw: number; speed: number; steer: number; turnRate: number; wheelAngle: number; lean: number }` — `speed` is signed forward m/s.
  - `createBoatMotionState(yaw: number): BoatMotionState`
  - `advanceBoat(state: BoatMotionState, input: { throttle: -1 | 0 | 1; steer: number; dt: number }): void` (mutates)
  - `reconcileBoatSpeed(commanded: number, measured: number): number`
  - `boatVelocity(input: { yaw: number; speed: number; velocityY: number; bodyY: number; time: number; dt: number }): { x: number; y: number; z: number }`
  - `boatWheelTarget(turnRate: number): number`
  - `inferBoatTurnRate(previousYaw: number, yaw: number, dt: number): number`

- [ ] **Step 1: Write the failing tests** in `boat-motion.test.ts`:
  - `"accelerates to an 8 m/s cruise and coasts down slowly"`: from rest, 600 steps of `throttle: 1, dt: 1/60` → `speed` within 0.05 of 8 and never above 8; then 60 steps of `throttle: 0` → speed still > 6 (long coast) and decreasing.
  - `"S slows a moving boat then reverses gently"`: at speed 8, `throttle: -1` for 2 s → speed ≤ 0; after 10 s → speed ≥ −2 − 1e-9 and < −1.5.
  - `"turns only while moving and slower than the scooter"`: at speed 0 with `steer: 1` for 1 s → yaw unchanged and `turnRate === 0`; at speed 8 with `steer: 1` → after convergence `turnRate` ≈ 0.9 and always < 1.65.
  - `"wheel follows the actual turn rate, not the key"`: at rest with `steer: 1` for 1 s → `wheelAngle` stays within 0.01 of 0; moving with `steer: 1` → `wheelAngle` converges to `boatWheelTarget(0.9)` = 2.4; `boatWheelTarget(-0.45)` = −1.2; `boatWheelTarget(5)` clamps to 2.4.
  - `"leans into turns, bounded"`: moving at 8 with `steer: 1` (a left turn) → `lean > 0` and `lean <= 0.06`; with `steer: -1` → `lean < 0`; at rest → `lean` ≈ 0. Positive lean means the boat's left (+X) side dips.
  - `"reverse steers the expected way"`: speed −2 with `steer: 1` → `turnRate < 0`.
  - `"ignores non-finite input and clamps dt spikes"`: `advanceBoat` with `dt: NaN`, `steer: Infinity` leaves every field finite; `dt: 5` behaves like `dt: 0.05`.
  - `"blocked boats lose commanded speed"`: `reconcileBoatSpeed(8, 0.4)` = 0.4; `reconcileBoatSpeed(8, 7.8)` = 8; `reconcileBoatSpeed(-2, -0.1)` = −0.1; `reconcileBoatSpeed(0, 3)` = 0.
  - `"floats at ride height without ground clamping"`: `boatVelocity({ yaw: 0, speed: 8, velocityY: 0, bodyY: LAKE_LEVEL + 0.75, time: 0, dt: 1/60 })` → `z` ≈ 8, `x` ≈ 0, `|y| < 0.2`; with `bodyY` 1 m too high → `y < 0`; `yaw: Math.PI / 2` → `x` ≈ 8.
  - `"infers turn rate across the ±π seam"`: `inferBoatTurnRate(3.13, -3.13, 0.1)` ≈ `(2π − 6.26) / 0.1` (small positive, < 1); `inferBoatTurnRate(0, 0.09, 0.1)` ≈ 0.9; `dt: 0` → 0.

- [ ] **Step 2: Run** `npx vitest run apps/web/src/boat-motion.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement `boat-motion.ts`.** Heading convention matches the scooter: +Z forward at yaw 0, positive yaw turns left (`scooterSteeringInput` returns `left − right`). Throttle accelerates toward `cruise` at `accel`; throttle 0 decays speed exponentially at `coastRate`; throttle −1 brakes at `brakeDecel` while speed > 0, then accelerates toward `−reverse` at `reverseAccel`. Steer input is damped (rate 6) into `state.steer`; `turnRate = steer × maxTurnRate × min(|speed| / fullTurnSpeed, 1) × sign(speed)`; `yaw += turnRate × dt`. `wheelAngle` damps (rate 10) toward `boatWheelTarget(turnRate)` = `clamp(turnRate / maxTurnRate, −1, 1) × wheelMaxAngle`. `lean` damps (rate 4) toward `clamp(turnRate × |speed| × 0.01, ±leanMax)`. `boatVelocity` uses the same damped float as `swimVelocity` but targets `LAKE_LEVEL + rideHeight + sin(time × 1.6) × bobAmplitude` and never clamps to ground height.

- [ ] **Step 4: Run** the test file — expect PASS. Run `npx tsc --noEmit`.

- [ ] **Step 5: Commit** `git add apps/web/src/boat-motion.ts apps/web/src/boat-motion.test.ts && git commit -m "Add the motorboat motion model"`

---

### Task 2: Boat state, dock spawns, boarding and exit rules

**Files:**
- Create: `apps/web/src/boat-state.ts`, `apps/web/src/boat-placement.ts`
- Test: `apps/web/src/boat-placement.test.ts`

**Interfaces:**
- Consumes: `southShore`, `inWater`, `terrainHeight` from `geography.ts`; `LAKE_LEVEL`.
- Produces:
  - `boat-state.ts` (mirrors `vehicle-state.ts`): `type BoatState = { mounted: boolean; parked: [number, number, number]; yaw: number; speed: number }`; `getBoatState(): Readonly<BoatState>`; `mountBoat(): void`; `parkBoat(position: [number, number, number], yaw: number): void`; `updateBoatMotion(yaw: number, speed: number): void`.
  - `boat-placement.ts`:
    - `BOAT_DOCK_XS = [0, -235] as const` (the two `<Dock>` x values in `settlement.tsx:269-270`).
    - `boatDockSpawn(dockX: number): { position: [number, number, number]; yaw: number }` — beside the dock on its east side, out in the lake, bow facing open water.
    - `nearestDockSpawn(x: number): { position: [number, number, number]; yaw: number }`
    - `BOAT_BOARD_DISTANCE = 3.5`
    - `canBoardBoat(input: { distance: number; scooterMounted: boolean; swimming: boolean; grounded: boolean; indoors: boolean; activity: string; paused: boolean }): boolean`
    - `boatExitCandidates(x: number, z: number, yaw: number): [number, number][]` — left, right, then bow points at 1.6 m and 2.6 m.
    - `chooseBoatExit(candidates: [number, number][], floorAt: (x: number, z: number) => number | undefined): { kind: "land"; position: [number, number, number] } | { kind: "water"; position: [number, number, number] }`

- [ ] **Step 1: Write the failing tests** in `boat-placement.test.ts`:
  - `"spawns each dock boat in open water clear of the dock"`: for both `BOAT_DOCK_XS`, `inWater(x, z)` is true, depth `LAKE_LEVEL − terrainHeight(x, z, undefined, true)` > 0.8, `|x − dockX| ≥ 1.7 + 0.75 + 0.5` (dock half-width + boat half-beam + margin), `position[1] === LAKE_LEVEL`, and the bow (`sin(yaw), cos(yaw)`) points away from the south shore (z decreasing).
  - `"nearest dock follows the home side of the lake"`: `nearestDockSpawn(-200)` equals `boatDockSpawn(-235)`; `nearestDockSpawn(40)` equals `boatDockSpawn(0)`.
  - `"boards from the ground or from swimming, never from the scooter"`: a base valid input `{ distance: 2, scooterMounted: false, swimming: false, grounded: true, indoors: false, activity: "none", paused: false }` → true; same with `swimming: true, grounded: false` → true; each of `distance: 3.6`, `scooterMounted: true`, `indoors: true`, `activity: "sit"`, `paused: true`, `grounded: false` (not swimming) → false.
  - `"tries both sides before the bow"`: `boatExitCandidates(0, 0, 0)` has 6 points, the first at x ≈ +1.6 (left of +Z-forward at yaw 0 is +X, matching the scooter's side-step `cos(yaw)`), the second at x ≈ −1.6, and all finite.
  - `"steps onto the first dry, level-enough spot"`: with `floorAt` returning `undefined` for the first candidate and `0.4` for the second → `{ kind: "land", position: [c2x, 0.4, c2z] }`; a floor below `LAKE_LEVEL + 0.1` counts as water.
  - `"falls back to the water beside the boat mid-lake"`: `floorAt` always `undefined` → `{ kind: "water" }` at the first candidate with `y === LAKE_LEVEL`.

- [ ] **Step 2: Run** `npx vitest run apps/web/src/boat-placement.test.ts` — expect FAIL.

- [ ] **Step 3: Implement both files.** The dock group sits at `(dockX, 0.85, southShore(dockX) − 4.1)` with a deck of half-extent 1.7 × 7.2 m (see `settlement.tsx:180-200`); place the boat at `dockX + 3.2`, `southShore(dockX) − 9`, yaw `Math.PI` (lake is −Z). If the depth assertion fails for a dock, move the spawn further toward −Z in 1 m steps inside `boatDockSpawn` until it holds, and record the final offsets as named constants. Initial `BoatState.parked` is `boatDockSpawn(0)`.

- [ ] **Step 4: Run** the test file — PASS; `npx tsc --noEmit`.

- [ ] **Step 5: Commit** `git add apps/web/src/boat-state.ts apps/web/src/boat-placement.ts apps/web/src/boat-placement.test.ts && git commit -m "Add personal boat state, dock spawns and boarding rules"`

---

### Task 3: Procedural motorboat model

**Files:**
- Create: `apps/web/src/boat-geometry.ts`, `apps/web/src/boat-resources.ts`, `apps/web/src/boat.tsx`
- Modify: `apps/web/public/assets/CREDITS.md` (one provenance paragraph)
- Test: `apps/web/src/boat-geometry.test.ts`

**Interfaces:**
- Consumes: `getBoatState` (Task 2) in `ParkedBoat`.
- Produces:
  - `BOAT_METRICS = { length: 3.6, beam: 1.4, floor: 0, seatHeight: 0.45, seat: [0, 0.45, -0.55], wheelPivot: [0, 0.95, 0.05], wheelRadius: 0.19, wheelTilt: 0.6, grips: { left: [-0.17, 0, 0], right: [0.17, 0, 0] } } as const` — metres, visual origin at the boat floor, +Z forward. Grips are in the wheel's local plane.
  - `type BoatSide = "left" | "right"`
  - `boatGripPosition(side: BoatSide, wheelAngle: number): [number, number, number]` — boat-local grip position on the rim for the given wheel rotation.
  - `type BoatRig = { group: THREE.Group; wheel: THREE.Group; hull: THREE.Group; dispose(): void }` with child names `"Motorboat_Stylized"` (group), `"Hull"`, `"Seat"`, `"SteeringWheel"`, `"Outboard"`.
  - `createBoatRig(): BoatRig`; `cloneBoatRig(): BoatRig` (page-lifetime template, like `scooter-resources.ts`).
  - `type BoatHandle = { update(motion: { wheelAngle: number; lean: number }): void; gripWorldPosition(side: BoatSide, target: THREE.Vector3): THREE.Vector3 }` — `gripWorldPosition` writes the grip's current world position (after wheel rotation and lean) into `target` via the wheel object's world matrix.
  - `Boat` (forwardRef, props `{ visible?: boolean }`) and `ParkedBoat({ mounted }: { mounted: boolean })` — parked visual at `getBoatState().parked`/`yaw` plus a fixed cuboid collider when not mounted, following `ParkedScooter`.

- [ ] **Step 1: Write the failing tests** in `boat-geometry.test.ts`:
  - `"names every animated and structural part"`: `createBoatRig().group.getObjectByName(n)` is defined for each of the five names; `rig.wheel` is the `"SteeringWheel"` object.
  - `"fits the declared footprint"`: the group's `Box3` size is within 0.15 m of `length` (Z) and `beam` (X); its min Y ≥ −0.5 (hull draft) and max Y < 1.4.
  - `"grips sit on the rim and turn with the wheel"`: for angles `[0, 1.2, -2.4]`, the distance from `boatGripPosition(side, a)` to `wheelPivot` ≈ `wheelRadius` (±0.01); left and right grips are mirrored at angle 0; at angle `π/2` the left grip has moved to where the top of the rim was at angle 0 (± 0.02).
  - `"seat matches the bench sit clip height"`: `BOAT_METRICS.seatHeight === 0.45` and the `"Seat"` object's world-space top is within 0.03 m of 0.45.
  - `"positive lean dips the left side"`: after `Boat`-equivalent logic sets `rig.group.rotation.z = -0.06`, a point at `[+0.7, 0.5, 0]` sits lower in world Y than `[-0.7, 0.5, 0]`. (Test the exported helper `applyBoatLean(rig: BoatRig, lean: number): void`.)
  - `"clones share geometry but not transforms"`: two `cloneBoatRig()` results have distinct `wheel` objects whose meshes share the same `geometry` instance.

- [ ] **Step 2: Run** `npx vitest run apps/web/src/boat-geometry.test.ts` — FAIL.

- [ ] **Step 3: Implement.** Follow `scooter-geometry.ts` conventions: one materials object (`hull` white-cream paint, `trim` dock timber `#a88d65`, `rubber`, `metal`), merged primitive pieces per part, `Seat` a timber bench with backrest at `seat`, a small console in front holding the tilted `SteeringWheel` group (pivot at `wheelPivot`, tilted back by `wheelTilt` about X; the wheel rotates about its own local Z), and an `Outboard` motor at the stern. `boatGripPosition` rotates the local grip about the wheel axis by `wheelAngle`, applies the tilt, then adds the pivot. `Boat.update` sets the wheel's local Z rotation from `wheelAngle` and calls `applyBoatLean(rig, lean)`, which rolls the whole boat group (`group.rotation.z = −lean`), so seat, console and wheel lean together. CREDITS: "The Motorboat_Stylized model is original project geometry built in code (`apps/web/src/boat-geometry.ts`); no third-party mesh is used."

- [ ] **Step 4: Run** tests — PASS; `npx tsc --noEmit`.

- [ ] **Step 5: Commit** `git add apps/web/src/boat-geometry.ts apps/web/src/boat-geometry.test.ts apps/web/src/boat-resources.ts apps/web/src/boat.tsx apps/web/public/assets/CREDITS.md && git commit -m "Add the original procedural motorboat model"`

---

### Task 4: Shared limb IK and the seated boat driver

**Files:**
- Create: `apps/web/src/limb-ik.ts`, `apps/web/src/boat-rider.ts`
- Modify: `apps/web/src/scooter-rider.ts` (use the extracted solver; behaviour unchanged)
- Test: `apps/web/src/boat-rider.test.ts` (existing `scooter-rider.test.ts` must still pass unchanged)

**Interfaces:**
- Consumes: `boatGripPosition`, `BOAT_METRICS` (Task 3; tests only).
- Produces:
  - `limb-ik.ts`: `solveTwoBoneIK(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3): void` (world-space target and pole; the body moved verbatim out of `scooter-rider.ts`'s `solve`/`aim`).
  - `boat-rider.ts`: `createBoatRiderRig(object: THREE.Object3D): { update(frame: { left: THREE.Vector3; right: THREE.Vector3 }): void; reset(): void; dispose(): void }` — world-space grip targets, normally from `BoatHandle.gripWorldPosition`, so hands follow wheel rotation and lean. Call `update` after `AnimationMixer.update` while `Activity_Sit` plays; it only moves the arm chains (`upperarm_l/r`, `lowerarm_l/r`, `hand_l/r`) so hands rest on the grips; `reset` restores the saved arm bones once on dismount; on a model lacking those bones it does nothing.

- [ ] **Step 1: Write the failing tests** in `boat-rider.test.ts`, loading the character the same way `scooter-rider.test.ts` does:
  - `"keeps both hands on the wheel grips as it turns"`: for wheel angles `[0, 1.2, -2.4, 2.4]`, after `update`, with targets built from `boatGripPosition(side, angle)` transformed by the character object's world matrix, each `hand_*` world position is within 0.05 m of its target (apply the same wrist-offset convention as the scooter rig).
  - `"stays finite over 6000 frames of changing wheel angles"`: random walk of angles within ±2.4; all bone quaternions finite and normalized.
  - `"restores every arm bone on reset"`: bone transforms after `reset()` equal those captured before the first `update` (±1e-6).
  - `"fails closed on an unrelated model"`: a plain `THREE.Group` with no bones → `update`/`reset` do not throw and change nothing.

- [ ] **Step 2: Run** `npx vitest run apps/web/src/boat-rider.test.ts` — FAIL.

- [ ] **Step 3: Extract `solveTwoBoneIK`** from `scooter-rider.ts` (lines ~147-205: `aim`, `solve` and their scratch vectors) into `limb-ik.ts`; make `scooter-rider.ts` call it. Run `npx vitest run apps/web/src/scooter-rider.test.ts` — all 5 existing tests PASS unchanged.

- [ ] **Step 4: Implement `boat-rider.ts`** using `solveTwoBoneIK`, poles below and outside each elbow (`sign × 0.35, 0.55, 0.15` in object space as a starting value), and hand rotation aligned to the wheel plane.

- [ ] **Step 5: Run** both rider test files — PASS; `npx tsc --noEmit`; `npm test`.

- [ ] **Step 6: Commit** `git add apps/web/src/limb-ik.ts apps/web/src/boat-rider.ts apps/web/src/boat-rider.test.ts apps/web/src/scooter-rider.ts && git commit -m "Seat the boat driver with hands on the wheel"`

---

### Task 5: Driving the boat locally

**Files:**
- Modify: `apps/web/src/player.tsx` (V key flow ~272-340, frame loop ~544-760, facing ~855, rider/vehicle update ~896, `onMotion` ~930, JSX ~967-1003, R reset ~432)
- Modify: `apps/web/src/Game.tsx` (prompts ~354-366, render `ParkedBoat` beside `ParkedScooter` ~463)
- Modify: `apps/web/src/SwimWake.tsx` (optional `scale` prop, default 1)
- Modify: `apps/web/src/activities.tsx` (lines ~256 and ~423: also refuse while `getBoatState().mounted`)
- Test: `apps/web/src/boat-placement.test.ts` (add the R-reset case), `apps/web/src/activity-interactions.test.ts` or the nearest existing activities test (add the boating guard case)

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: `PlayerProps.onBoatHint?: (near: boolean) => void`; `onMotion` sample `vehicle: "QuickVolt 9" | "Motorboat" | null` and `vehicleSpeed` = boat signed speed while boating (consumed by Task 6).

- [ ] **Step 1: Write the failing tests:**
  - In `boat-placement.test.ts`, `"returning home puts the boat back at the nearest dock"`: after `parkBoat([500, LAKE_LEVEL, -300], 1)`, calling the new `resetBoatToDock(homeX: number): void` (add to `boat-state.ts`) makes `getBoatState().parked` equal `nearestDockSpawn(homeX).position` and `mounted` false.
  - In the activities test file, `"activities refuse to start while driving a boat"`: with `mountBoat()` applied, the same entry point the existing scooter-guard test uses returns its refusal; call `parkBoat(...)` in cleanup.

- [ ] **Step 2: Run** those two files — FAIL.

- [ ] **Step 3: Implement `resetBoatToDock` and the activities guard.** Run the two files — PASS.

- [ ] **Step 4: Wire boating into `player.tsx`:**
  - State: `const [boating, setBoating] = useState(false)`, `boatMotion = useRef(createBoatMotionState(0))`, `boatRider` ref (created like `riderRig`), `boat` ref (`BoatHandle`), `nearBoat` ref.
  - **V key:** if boating → `chooseBoatExit(boatExitCandidates(...), floorAt-style raycast excluding the body)`; park the boat at the capsule's x/z, `LAKE_LEVEL`, current yaw; teleport to the exit (`y + 0.95` on land; on water, leave swimming to take over); `boatRider.reset()`, `mixer.stopAllAction()`, `animation.current = ""`, gravity scale back to 1, `setBoating(false)`. Else if `canBoardBoat({...})` with distance to `getBoatState().parked` → `mountBoat()`, reset `boatMotion` to the parked yaw with speed 0, teleport the body to parked x/z at `LAKE_LEVEL + BOAT_TUNING.rideHeight`, zero velocity, gravity 0, clear swimming (`swimmingRef.current = false; setSwimming(false)`), `setBoating(true)`. Scooter V handling only runs when not boating and not near the boat while swimming. Keep the existing `keys.current.clear()` / jump resets.
  - **Frame loop:** when `getBoatState().mounted`: treat as `occupied` for `swimmingState`; skip the scooter-in-water auto-park (`mounted` there stays scooter-only); throttle from W/S, steer from `scooterSteeringInput(A, D)` when `active`; `advanceBoat`; `boatMotion.speed = reconcileBoatSpeed(speed, measuredForward)` using the body's previous-frame linvel projected on the heading; `c.body.setGravityScale(0)`; `c.body.setLinvel(boatVelocity({...}))`; `c.setMovement` all false; jumps disabled; `updateBoatMotion(yaw, speed)`.
  - **Visual:** offset `visual.position.y` so the visual origin is the boat floor: `LAKE_LEVEL + 0.15 − playerViewPosition.y`; facing uses `boatMotion.yaw`; animation `"Activity_Sit"` (loop) while boating; after the mixer update call `boat.current?.update({ wheelAngle, lean })` then `boatRider.current?.update({ left, right })` with both targets from `boat.current.gripWorldPosition` (reuse two scratch vectors).
  - **Ecctrl:** `enable={!swimming && !boating}`.
  - **JSX:** `<Boat ref={boat} visible={boating} />` inside the visual group next to `<Scooter>`; `{boating && <SwimWake scale={2.6} />}` beside the existing swim wake.
  - **Hints/onMotion:** `nearBoat` computed like `nearScooter` (≤ `BOAT_BOARD_DISTANCE`, not boating, allowed while swimming) → `onBoatHint`; `onMotion.vehicle` = `"Motorboat"` while boating; `grounded` false while boating.
  - **R reset (~432):** also `resetBoatToDock(arrival.position[0])` and leave boating state cleanly.
  - **Stun/punch:** Q punch handler returns early while boating.
- [ ] **Step 5: Wire `Game.tsx`:** `const [boatNear, setBoatNear] = useState(false)`; pass `onBoatHint={setBoatNear}`; render `{hasHome && <ParkedBoat mounted={boatMounted} />}` where `boatMounted` comes from a new `onBoatChange` prop mirroring `onVehicleChange`; prompt `{ main: "Drive the motorboat", detail: "W throttle · A/D steer · V step out", key: "V" }` when near, and the existing mounted-hint pattern with detail `"V near a bank to step out"` while driving.
- [ ] **Step 6: Verify** `npx tsc --noEmit`, `npm test` (all prior tests plus new ones), `npm run build`.
- [ ] **Step 7: Commit** `git add` the six modified source files and the two test files `&& git commit -m "Let players drive their own motorboat"`

---

### Task 6: Friends see the boat

**Files:**
- Modify: `packages/shared/protocol.ts:30` and `:248` (`vehicle: "none" | "scooter" | "boat"`)
- Modify: `apps/web/src/multiplayer.ts:577-580`
- Modify: `apps/web/src/multiplayer-players.tsx` (~107-135 helpers, ~170-305 frame + JSX)
- Test: `tests/protocol.test.ts`, `apps/web/src/multiplayer.test.ts`

**Interfaces:**
- Consumes: `onMotion` sample from Task 5; `Boat`, `createBoatRiderRig`, `inferBoatTurnRate`, `boatWheelTarget` (Tasks 1, 3, 4).
- Produces: `vehicleKind(name: unknown): PlayerPose["vehicle"]` exported from `multiplayer.ts` (`"Motorboat"` → `"boat"`, any other truthy string → `"scooter"`, else `"none"`).

- [ ] **Step 1: Write the failing tests:**
  - `tests/protocol.test.ts`: a pose with `vehicle: "boat"` is accepted and relayed unchanged; `vehicle: "yacht"` is rejected exactly like other invalid vehicles (follow the existing `[[0, 0, 1], { vehicle: "scooter" }]` table near line 817).
  - `multiplayer.test.ts`: `vehicleKind("Motorboat") === "boat"`, `vehicleKind("QuickVolt 9") === "scooter"`, `vehicleKind(null) === "none"`; a published sample with `vehicle: "Motorboat", vehicleSpeed: 6.5` produces `pose.vehicle === "boat"` and `pose.speed === 6.5`.
- [ ] **Step 2: Run** `npm run test:protocol` and `npx vitest run apps/web/src/multiplayer.test.ts` — FAIL.
- [ ] **Step 3: Implement protocol and `vehicleKind`.** Run both — PASS; `npm run server:check`.
- [ ] **Step 4: Remote rendering in `multiplayer-players.tsx`:** `boating = player.vehicle === "boat"`; lazily mount `<Boat>` under the remote root like `hasScooter`; keep a per-remote `{ previousYaw, wheelAngle, lean }`; each frame `turnRate = inferBoatTurnRate(previousYaw, smoothedYaw, dt)`, damp `wheelAngle` toward `boatWheelTarget(turnRate)` (rate 10) and `lean` as in Task 1; call `boat.update` then the remote `createBoatRiderRig` `update` with targets from `gripWorldPosition`, after the mixer; show `<SwimWake scale={2.6} />` while boating; `reset` the remote boat rider when boating ends. The remote animation already arrives as `"Activity_Sit"`.
- [ ] **Step 5: Verify** `npx tsc --noEmit`, `npm test`, `npm run test:protocol`, `npm run server:check`, `npm run build`.
- [ ] **Step 6: Commit** `git add packages/shared/protocol.ts apps/web/src/multiplayer.ts apps/web/src/multiplayer-players.tsx tests/protocol.test.ts apps/web/src/multiplayer.test.ts && git commit -m "Show other players driving their boats"`

---

### Task 7: Browser verification and boat notes

**Files:**
- Create: `docs/boats/README.md`
- Create: `docs/boats/captures/` (screenshots from this task)

- [ ] **Step 1: Start the one local server.** `lsof -nP -iTCP:4173 -sTCP:LISTEN`; if nothing listens, run `npm run dev` in the background (offline mode, no `VITE_ROOM_SERVER_URL`). If something listens, stop and report instead of starting another.
- [ ] **Step 2: Drive the acceptance path with Playwright** at `http://127.0.0.1:4173/`: confirm a name, walk to the west dock, see the "Drive the motorboat" prompt, press V, hold W for 8 s and A for 2 s, screenshot the wheel turned with hands on it (`captures/boat-turning.png`), drive into the south bank at full throttle and confirm the boat stops without climbing (`captures/boat-beached.png`), press V to step onto land, re-board, drive out, press V mid-lake and confirm swimming beside the parked boat (`captures/boat-swim-exit.png`), press R and confirm the boat is back at the dock. Record console errors (expect zero).
- [ ] **Step 3: Stop the dev server** started in Step 1 (only that process).
- [ ] **Step 4: Write `docs/boats/README.md`** in the style of `docs/swimming/README.md`: what phase 1 does, controls, tuning values, how the wheel/hands follow the turn, multiplayer behaviour (`vehicle: "boat"`, inferred remote wheel, old clients show a seated avatar without a boat until they reload — deploy the Worker before the frontend), known limits (boat visible only to its owner when parked; resets on reload; north shore terrain is a proxy), and the captures.
- [ ] **Step 5: Commit** `git add docs/boats && git commit -m "Document personal motorboats and their verification"`
