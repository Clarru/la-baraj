# Boat bumps and bending wake — design note and plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the runabout a wake that bends through turns and lingers where the boat has been, and verify boat-to-boat bumps and turning collision in a real two-client room against a locally run room server.

**Architecture:** A pure, allocation-free ring buffer of world-space transom samples (`boat-wake-trail.ts`) is filled every frame by `BoatSpray` and laid out into a per-boat `BufferGeometry` whose attributes are updated in place; the ribbon is drawn in world space (R3F portal to the scene) by the existing shared wake `ShaderMaterial`, while the rooster tail stays a child of the hull. Collision work (items 1 and 2 of the brief) is already on `main`; this branch verifies it live instead of re-implementing it.

**Tech Stack:** React 19, TypeScript, three.js 0.186, React Three Fiber 9, Vitest; Cloudflare `wrangler dev` for the local PartyServer room.

**Spec:** this file ("Design note" below) plus the owner brief relayed in the orchestrator prompt.

## Design note

### What is already on main (ruling R1)

The brief described `boat-collision.ts` as translation-only and boat-to-boat contact as absent. At the branch base (`462252f`) both are already implemented:

- **Turning collision** — `boatTurnBlocked` (`apps/web/src/boat-collision.ts`, commit `395a48b`) sweeps the hull through each yaw step with padded boxes, so a blocked turn keeps the previous heading. `boat-collision.test.ts` has a Rapier regression suite (steering penetration, bow/stern, thin pilings, sensors).
- **Boat-to-boat impacts** — commits `3f7b69e`, `a529c38`, `dd10f23`: the room authority (`apps/server/boat-collisions.ts`, `packages/shared/boats.ts` `resolveBoatImpact` / `sweepBoatImpact`) computes a damped, symmetric response (restitution 0.05) and sends each occupied participant a correction; moored boats are solid and immovable; `apps/web/src/boat-impact.test.ts` and `tests/boat-collisions.test.ts` cover approach, rear, head-on, glancing, reverse, moored, boost and energy conservation. `docs/boats/collisions.md` records a paired-browser pass with an in-page authority.

**Ruling R1:** do not re-implement items 1 and 2. A client-local "fender bump" on top of the authoritative correction would double-resolve every contact (client pushes away, server then corrects to its own result) and produce exactly the jitter the brief forbids. The existing design is a superset of the requested behaviour (symmetric, no tunnelling at 12.8 m/s, moored solid), so this branch keeps it and verifies it against a *real* local Worker room (item 4), which the previous pass did not do. Cost if wrong: the owner wanted a client-only variant despite the server one; reversing is a small, isolated change and no code here forecloses it.

### Bending wake (item 3)

Today `boat-spray.tsx` draws the V wake in hull-local space from a packed geometry (`along, across, arm`) laid out in the vertex shader. Replace the *wake* mesh (not the tail) with a trail ribbon:

- **Trail buffer** (`apps/web/src/boat-wake-trail.ts`, pure): a ring of `WAKE_TRAIL_SAMPLES = 48` samples, each `(x, z, time, spread, strength)` in one `Float32Array` (stride 5). `pushWakeSample` accepts a new transom point when it is at least `WAKE_SAMPLE_DISTANCE = 0.35` m from the newest sample *or* `WAKE_SAMPLE_INTERVAL = 0.15` s have passed; otherwise it overwrites the newest sample's position (so the ribbon head always touches the transom). Samples older than `WAKE_FADE_SECONDS = 3.5` are dropped from the tail. `spread` is the hull speed's `spraySize().width` at that moment, `strength` its `opacity`. Boat stationary: nothing is pushed (strength 0), and the trail still ages out.
- **Ribbon layout** (`layoutWakeRibbon`, pure): walks the live samples oldest→newest and writes world-space vertices into a caller-owned `Float32Array` position buffer plus an `aux` buffer `(along 0..1 from head, across −1..1, arm −1/0/1)`. Three strips (port arm, centre wash, starboard arm), three vertices across each — the same topology as today, so the fragment shader (edge/fade/streak) is unchanged and the index buffer is static. Lateral direction at a sample is the perpendicular of the segment to its neighbour. Arm centre = `arm * (halfBeam*0.85 + 0.5 * spread * along)`; arm width as today. Age fade multiplies into `along` so `pow(1 - along, 1.6)` fades the tail out over `WAKE_FADE_SECONDS` regardless of distance. Vertices for unused ring slots are collapsed onto the head (zero-area), never deallocated.
- **Rendering** (`boat-spray.tsx`): each `BoatSpray` owns one `BufferGeometry` with `DynamicDrawUsage` attributes sized for `WAKE_TRAIL_SAMPLES`; `useFrame` calls `pushWakeSample` with the transom world position (parent matrixWorld × `(0, 0, -sternExtent)`) and `layoutWakeRibbon`, then sets `needsUpdate` and updates `boundingSphere` in place (centre = trail midpoint, radius = half the trail extent + max spread + 1 m). The wake mesh is rendered through `createPortal(..., scene)` so its matrix is identity and vertices are world space (y = `LAKE_LEVEL + FOAM_LIFT`). The vertex shader becomes a pass-through for `position` and copies `aux` into the varyings. Per-boat opacity/intensity uniforms keep flowing through the existing `onBeforeRender` state copy (`uLength`/`uSpread` stay for the tail). Remote boats mount the same component, so they get the bending wake from interpolated positions with no extra code. Day/night intensity and speed/boost scaling are preserved through `spraySize` and `sprayIntensity`.
- **Budget:** 48 samples × 3 strips × 3 vertices = 432 vertices × (3 + 3) floats per boat; 30 boats ≈ 1.5 MB of attributes, two draws per boat as today, zero per-frame allocations.

### Live-room verification (item 4)

`npx wrangler dev --config apps/server/wrangler.jsonc --port 8790 --var ALLOWED_ORIGINS:http://127.0.0.1:4173` runs the real Worker locally (Durable Object in Miniflare, RAM-only). Build with `VITE_ROOM_SERVER_URL=http://127.0.0.1:8790 VITE_GAME_DIAGNOSTICS=1 npm run build` (the client switches to `ws:` for `127.0.0.1`), serve with the single `npm run preview` on 4173, and open two isolated Playwright contexts (two players). Owner-approved extra listener; stop it afterwards. Never set `VITE_ROOM_SERVER_URL` to the production Worker.

## Global Constraints

- Node via `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`; Node 24.x.
- No protocol or server changes (`packages/shared/protocol.ts`, `apps/server/*` untouched).
- Swimmers and walkers unchanged (`SwimWake`, `swim-motion.ts` untouched).
- No per-frame allocations in `useFrame` paths; fixed-size buffers; attributes updated in place.
- Commits by the worktree identity (georgeab550). No Co-Authored-By or other trailers. No push, PR or merge.
- Game preview is only `npm run preview` on 4173; check `lsof -nP -iTCP:4173 -sTCP:LISTEN` first.
- No left/side accent borders in any doc or UI.

## Review Focus

1. Boat stopped after a run: the trail must fade out completely within `WAKE_FADE_SECONDS` and leave no frozen ribbon — pinned by `fades out all samples after WAKE_FADE_SECONDS` (Task 1).
2. Reset (`R`) / teleport snaps the hull tens of metres: the ribbon must not draw a line across the lake — pinned by `clears the trail on a jump longer than WAKE_RESET_DISTANCE` (Task 1).
3. Remote boat whose pose snaps (10 m remote snap distance in `multiplayer-players.tsx`): same clear path as above, same test.
4. `time` going backwards or NaN inputs (clock reset, remote pose before first sample): `pushWakeSample` must ignore non-finite input and never write NaN into attributes — pinned by `ignores non-finite samples` (Task 1).
5. Visibility: a boat with an empty trail must not render a degenerate ribbon; the head sample collapsing all unused vertices must give alpha 0 — pinned by `collapses unused vertices onto the head with zero along` (Task 1) and by the browser check in Task 3.

---

### Task 1: Wake trail buffer and ribbon layout (pure)

**Files:**
- Create: `apps/web/src/boat-wake-trail.ts`
- Test: `apps/web/src/boat-wake-trail.test.ts`

**Interfaces:**
- Consumes: `spraySize` / `SpraySize` from `./boat-spray.ts`, `BOAT_DIMENSIONS.beam` from `./boat-geometry`.
- Produces:
  ```ts
  export const WAKE_TRAIL_SAMPLES = 48;
  export const WAKE_SAMPLE_DISTANCE = 0.35;   // m
  export const WAKE_SAMPLE_INTERVAL = 0.15;   // s
  export const WAKE_FADE_SECONDS = 3.5;
  export const WAKE_RESET_DISTANCE = 6;       // m: a longer jump clears the trail
  export const WAKE_STRIPS = 3, WAKE_ACROSS = 3;
  export const WAKE_VERTEX_COUNT = WAKE_TRAIL_SAMPLES * WAKE_STRIPS * WAKE_ACROSS;
  export type WakeTrail = { data: Float32Array; head: number; count: number };
  export function createWakeTrail(): WakeTrail;
  /** Returns true when a new sample was appended (vs. head moved or ignored). */
  export function pushWakeSample(trail: WakeTrail, x: number, z: number, time: number, spread: number, strength: number): boolean;
  /** Drops samples older than WAKE_FADE_SECONDS; returns live count. */
  export function pruneWakeTrail(trail: WakeTrail, time: number): number;
  export function clearWakeTrail(trail: WakeTrail): void;
  /** Writes WAKE_VERTEX_COUNT world-space vertices (xyz) and aux (along, across, arm); returns live sample count. Also fills `bounds` = [cx, cz, radius]. */
  export function layoutWakeRibbon(trail: WakeTrail, time: number, y: number, positions: Float32Array, aux: Float32Array, bounds: Float32Array): number;
  export function wakeRibbonIndex(): Uint16Array; // static, same strip topology as the old packed geometry
  ```

- [ ] **Step 1: Write the failing tests** in `apps/web/src/boat-wake-trail.test.ts`:
  - `appends by distance or time`: push (0,0,t=0); push (0.1,0,t=0.05) → false and head position moved to (0.1,0); push (0.5,0,t=0.06) → true (distance); push (0.5,0.01,t=0.3) → true (interval); `count === 3`.
  - `ring wraps without growing`: push `WAKE_TRAIL_SAMPLES + 10` samples 1 m apart, `count === WAKE_TRAIL_SAMPLES`, `data.length` unchanged.
  - `fades out all samples after WAKE_FADE_SECONDS`: 5 samples at t 0..2; `pruneWakeTrail(trail, 2 + WAKE_FADE_SECONDS + 0.01) === 0`; a layout afterwards returns 0 and `bounds[2] >= 0`.
  - `clears the trail on a jump longer than WAKE_RESET_DISTANCE`: trail of 3 samples, push a point `WAKE_RESET_DISTANCE + 1` away → `count === 1` and head is the new point.
  - `ignores non-finite samples`: push `NaN`/`Infinity` x or time → returns false, count unchanged, no NaN in `data`.
  - `lays out a straight run as a symmetric V`: 10 samples along +z, spread 4, strength 1, time now; after layout, for every sample the port arm x is negative of the starboard arm x, centre strip x ≈ 0, and the arm half-separation grows monotonically from head to tail; `aux` along increases from 0 at the head to ≤ 1 at the tail; all `y === given y`.
  - `bends through a turn`: samples on a quarter circle of radius 10; arm vertices at mid-trail have lateral offset perpendicular to the local tangent (dot product with tangent ≈ 0 within 1e-3).
  - `collapses unused vertices onto the head with zero along`: 2 samples; all vertices from slot 2 on equal the head xyz and `aux along === 0`.
  - `never allocates during layout`: call layout twice with the same buffers, assert the same `Float32Array` instances are untouched in identity and that `positions.length === WAKE_VERTEX_COUNT * 3`.
  - `index covers every strip once`: `wakeRibbonIndex().length === WAKE_STRIPS * (WAKE_TRAIL_SAMPLES - 1) * 2 * 6` and max index `< WAKE_VERTEX_COUNT`.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/boat-wake-trail.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `apps/web/src/boat-wake-trail.ts` with the interface above. Layout: walk samples oldest→newest (`along = ageFade = clamp(age / WAKE_FADE_SECONDS, 0, 1)` blended with the distance fraction: `along = max(distanceFromHead / trailLength, age / WAKE_FADE_SECONDS)`), tangent from neighbouring samples (head uses its previous segment), lateral = (−tz, tx). Arm centre `arm * (beam * 0.425 + 0.5 * spread * along)`, width `arm === 0 ? mix(beam*0.55, beam*0.8, along) : 0.3 + 0.18 * spread * along`; multiply `along` written to aux by `(1 - strength)` blend so weak samples fade (`alongOut = 1 - (1 - along) * strength`). Single sample: lateral defaults to (1, 0).
- [ ] **Step 4: Run** the test file → PASS; run `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `Add a world-space wake trail buffer and ribbon layout`.

### Task 2: Draw the V wake along the trail

**Files:**
- Modify: `apps/web/src/boat-spray.tsx` (wake geometry/material/`BoatSpray`)
- Modify (doc only): `docs/boats/README.md` Jet stream section

**Interfaces:**
- Consumes: everything in Task 1's Produces block; `createPortal` and `useThree` from `@react-three/fiber`.
- Produces: `BoatSpray({ speed })` keeps its signature; callers in `player.tsx:1612` and `multiplayer-players.tsx:434` are unchanged.

- [ ] **Step 1: Replace the shared packed `wakeGeometry`** with a per-instance factory `createWakeGeometry()` that allocates `position` (Float32, 3, `DynamicDrawUsage`), `aux` (Float32, 3, `DynamicDrawUsage`), the static index from `wakeRibbonIndex()`, and a `boundingSphere` object updated in place. Dispose it on unmount.
- [ ] **Step 2: Vertex shader** of `wakeMaterial`: `attribute vec3 aux; vAlong = aux.x; vAcross = aux.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);` (drop `uLength`/`uSpread`/`uBeam` use in the wake vertex shader; keep the uniforms object so `applyState` stays shared). Fragment shader unchanged.
- [ ] **Step 3: `BoatSpray`** — add `trail = useMemo(createWakeTrail)`, `bounds = useMemo(() => new Float32Array(3))`, `transom = useMemo(() => new THREE.Vector3())`. In `useFrame`: compute the transom world point `transom.set(0, 0, -BOAT_DIMENSIONS.sternExtent).applyMatrix4(root.parent.matrixWorld)`; `pushWakeSample(trail, transom.x, transom.z, clock.elapsedTime, spray.width, spray.opacity)` only when `spray.opacity > 0`; `pruneWakeTrail`; `layoutWakeRibbon(trail, clock.elapsedTime, LAKE_LEVEL + FOAM_LIFT, pos.array, aux.array, bounds)`; set both attributes `needsUpdate = true`; set `boundingSphere.center.set(bounds[0], y, bounds[1])`, `radius = bounds[2] + MAX_SPRAY.width + 1`. Wake mesh visible while `trail.count > 1` (even when the boat has stopped, so the wake fades out); the tail/group visibility keeps the old `spray.opacity > 0` rule.
- [ ] **Step 4: Render** the wake mesh with `createPortal(<mesh .../>, scene)` where `scene = useThree((s) => s.scene)`; keep `renderOrder={2}`, `dispose={null}` on the material only. Tail `<points>` stays inside the group as today.
- [ ] **Step 5: Verify** `npx tsc --noEmit`, `npm test`, `VITE_GAME_DIAGNOSTICS=1 npm run build`; load the build on 4173 (reuse or start the single preview) in Playwright, board (`V`), hold `W` then `A` for a turn, screenshot: the wake must curve and stay behind the turn. Save to `docs/boats/captures/wake-bend-own.png`.
- [ ] **Step 6: Docs** — in `docs/boats/README.md` replace the jet-stream description with the trail design (constants, buffer sizes, fade). Commit `Bend the runabout wake along a world-space trail`.

### Task 3: Live-room verification, captures and docs

**Files:**
- Create: `docs/boats/captures/bump-side-a.png`, `bump-side-b.png`, `wake-bend-remote.png`
- Create: `docs/boats/results/live-room-2026-10-30.md` (telemetry and steps)
- Modify: `docs/boats/README.md` (verification entry), `docs/boats/bumps-and-wake-plan.md` (ledger)

- [ ] **Step 1:** `lsof -nP -iTCP:4173 -sTCP:LISTEN`, `lsof -nP -iTCP:8790 -sTCP:LISTEN` — both free (or 4173 a project preview to reuse).
- [ ] **Step 2:** Start `npx wrangler dev --config apps/server/wrangler.jsonc --port 8790 --var ALLOWED_ORIGINS:http://127.0.0.1:4173 --local` in the background (log to the scratchpad); confirm `curl -s http://127.0.0.1:8790/` returns `ok: true` with the local service.
- [ ] **Step 3:** `VITE_ROOM_SERVER_URL=http://127.0.0.1:8790 VITE_GAME_DIAGNOSTICS=1 npm run build`, then `npm run preview` (background).
- [ ] **Step 4:** Two Playwright browser contexts on `http://127.0.0.1:4173/`. In each: wait for status connected (diagnostic DOM), walk to and board the own boat (`V`), confirm the other client renders the remote boat (`data-vehicle="boat"` badge, LOD mesh, `BoatSpray` present under `Online player`).
- [ ] **Step 5:** Bump: drive client A into client B's hull (B stationary then B driving); record speeds before/after from the diagnostic DOM on both clients (A loses most speed, B receives a push; no interpenetration; no jitter for 3 s). Screenshot both sides.
- [ ] **Step 6:** Wake: A drives a turn; screenshot from B (remote bending wake) and from A (own). Save captures.
- [ ] **Step 7:** Stop preview and wrangler (`kill` the PIDs you started, verify both ports free). Restore the normal build? — the normal preview is not running on this machine, so leave `dist/` as a diagnostics build and say so in the report.
- [ ] **Step 8:** Write results file and README entry; commit `Verify boat bumps and bending wake in a local two-client room`.

## Ledger

- **R1** — keep main's authoritative boat impacts and turning sweep; verify rather than re-implement (above).
- **R2** — the wake ribbon is a per-boat dynamic geometry (not instanced): 30 boats × 432 vertices is small, and instancing would need a per-instance texture for the trail anyway.
- **R3** — the local room server is `wrangler dev` on port 8790 with `ALLOWED_ORIGINS=http://127.0.0.1:4173`, RAM-only (`--local`), killed after the test. Nothing is pointed at the production Worker.
