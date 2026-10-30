# Meadow (grass and wildflowers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover the open land around the player with instanced grass tufts and clumped wildflowers that follow the camera, fade with distance, sway in the vertex shader, and cost under ~2 ms and ~10 draw calls per frame.

**Architecture:** A pure module `meadow.ts` decides *where* plants go (chunk grid keyed by camera position, seeded sampling, geography exclusions, quality tier) and *what* they look like (solid blade/flower geometry, a `MeshStandardMaterial` patched by `onBeforeCompile` for wind, distance fade and base shading). A thin R3F component `Meadow.tsx` owns two `InstancedMesh`es (all grass, all flowers: 2 draw calls), assigns each visible chunk a fixed slot range inside those meshes, rebuilds at most a few milliseconds of chunks per frame as the camera crosses chunk borders, and uploads only the changed ranges. Distance fade and density thinning happen in the vertex shader from `cameraPosition`, so there is no per-frame per-instance JS and no pop.

**Tech Stack:** React 19, React Three Fiber, three 0.186 (`InstancedMesh`, `BufferAttribute.addUpdateRange`, `onBeforeCompile`), vitest. No new dependencies.

**Spec:** The owner request in the orchestrator brief, summarised in `docs/meadow/README.md` once written. Existing geography helpers: `apps/web/src/geography.ts` (`inWater`, `shoreDistance`, `terrainHeight`, `roads`, `cabinSpots`, `activityClearance`, `southShore`, `rng`). Lighting: `apps/web/src/day-night.ts`, `WorldLighting.tsx`. Perf lab: `apps/web/src/PerformanceLab.tsx`.

## Global Constraints

- Branch `meadow` in `/Users/george2/repos/la-baraj-worktrees/meadow`; every shell `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- Commits by the worktree's configured identity. **No Co-Authored-By or any Claude trailer.** No push, PR, merge; never touch main. No bare `git stash`, no `git clean -fdx`.
- Do not edit `apps/web/src/boat-*` (owned by another branch). Keep the existing MegaKit plants in `environment.tsx` untouched.
- Grass and flowers never cast shadows (`castShadow=false`) and never become colliders (not in `NearbySolids`, no `RigidBody`).
- No per-frame allocations and no per-frame per-instance JS in `useFrame`; wind/fade in the vertex shader only.
- Only the single preview on 127.0.0.1:4173 (strict port) and only when free; `npm run dev` is broken, use `VITE_GAME_DIAGNOSTICS=1 npm run build` (+ `VITE_PERFORMANCE_LAB=1` for measurement builds). Never contact the production Worker.
- Palette for flowers (DESIGN.md): cream `#f3e5c9`, violet `#7e648d`, ochre `#a8622b`, plus a muted yellow `#d8b85a`. Grass tint band `#5f7c44`–`#89a357` around the terrain paint `#69844b`.

## Review Focus

1. Camera far from any land (across the lake, survey camera at [58,35,72]): chunk sampling over water must produce zero instances cheaply, not NaNs or stale slots. Pinned by Task 1 `sampleChunk` test on a water chunk.
2. Fast movement (scooter, ~8 m/s) crossing many chunk borders: the update queue must stay bounded and drop chunks that left the window before being built. Pinned by Task 2 `planChunkUpdates` test.
3. Zero-sized/degenerate instances must stay invisible yet keep `gl.info` finite; unused slots get an all-zero matrix. Pinned by Task 2 slot-clear test.
4. `prefers-reduced-motion: reduce` disables sway (wind uniform 0) without changing placement. Pinned by Task 2 test on `windAmplitude(reduced)`.
5. Two `onBeforeCompile` variants of `MeshStandardMaterial` must not share a shader program: `customProgramCacheKey` differs per kind. Pinned by Task 1 material test.

---

### Task 0: Before-baseline on main (orchestrator, not delegated)

Build the untouched worktree (HEAD == origin/main 462252f) with `VITE_PERFORMANCE_LAB=1 VITE_GAME_DIAGNOSTICS=1 npm run build`, serve with one `npm run preview` when 4173 is free, open `http://127.0.0.1:4173/?time=12` with the lab scenarios `solo` and `crowd` at view `arrival`, reset measurement, wait for 600 frames, save `data-metrics` JSON to `docs/meadow/perf/before-<scenario>.json`. Capture `docs/meadow/captures/before-{shore,hill,close,dusk}.png` (dusk via `?time=19.5`). Stop the preview. Record hardware (Apple M2 Pro, 16 GB) and the measurement method (unthrottled vs vsync) in `docs/meadow/README.md`.

### Task 1: `meadow.ts` placement core, geometry and material

**Files:**
- Create: `apps/web/src/meadow.ts`
- Test: `apps/web/src/meadow.test.ts`

**Interfaces (Produces):**
```ts
export type MeadowTier = "off" | "low" | "high";
export type TierSettings = {
  chunk: number;          // metres per chunk side: 16
  ring: number;           // chunks per window side (odd): high 7, low 5
  fullRadius: number;     // full density up to: high 22, low 14
  fadeRadius: number;     // zero density at: high 48, low 30
  grassPerChunk: number;  // slot capacity per chunk: high 400, low 190
  flowersPerChunk: number;// high 56, low 28
};
export const TIERS: Record<Exclude<MeadowTier, "off">, TierSettings>;
export function meadowTier(input: {
  override?: string | null; cores?: number; memoryGiB?: number;
  mobile: boolean; renderer: string;
}): MeadowTier;  // override "off"|"low"|"high" wins; mobile || cores<=4 || memoryGiB<=4 || /intel|swiftshader|llvmpipe|mali|adreno/i → "low"; else "high"
export function canMeadow(x: number, z: number, shore?: number, wet?: boolean): boolean;
// !wet && shore > 4 && drawnRoadDistance > 3.2 && activityClearance && no cabinSpot within 9.5 && dock hypot(x-4, z-(southShore(0)+12)) > 16
export function drawnRoadDistance(x: number, z: number): number; // roads excluding footpath kinds path, footway, track, steps, pedestrian, cycleway, bridleway (same set as landscape-geometry's footpaths)
export type ChunkKey = string; // `${cx},${cz}` of Math.floor(x/chunk)
export function chunkWindow(camX: number, camZ: number, settings: TierSettings): ChunkKey[]; // ring×ring keys centred on the camera chunk, sorted nearest-first
export type ChunkSample = {
  grass: Float32Array;   // n*6: x, y, z, yaw, scale, random(0..1)
  grassCount: number;
  flowers: Float32Array; // n*7: x, y, z, yaw, scale, random, colourIndex
  flowerCount: number;
};
export function sampleChunk(key: ChunkKey, settings: TierSettings): ChunkSample; // deterministic: rng(hash(key)); evaluates a 2 m grid (9×9 for chunk 16) of {shore, wet, height, ok} once, then jitters candidates in cells whose four corners are ok; height bilinear from the grid minus 0.04; grass density modulated 0.7–1.0 by lowNoise; flowers only where flowerPatch(x,z) > 0.45 (patches ~15–25 m across), colourIndex = patch-dominant colour (hash of floor(x/12),floor(z/12)) with 20% random others
export const FLOWER_COLOURS: readonly string[]; // ["#f3e5c9", "#7e648d", "#a8622b", "#d8b85a"]
export function densityAt(distance: number, settings: TierSettings): number; // 1 - smoothstep(fullRadius, fadeRadius, distance), same formula as the shader
export function tuftGeometry(): THREE.BufferGeometry; // 6 blades × 2 segments (3 tris each) = 18 tris, non-indexed or indexed, uv.y = height fraction 0..1, normals = normalize(up*0.8 + facing*0.2)
export function flowerGeometry(): THREE.BufferGeometry; // stem cross (2 quads) + 6-tri petal fan at height 0.32; uv.x = 1 on petals, 0 on stem; uv.y = height fraction
export const meadowUniforms: { uTime: { value: number }; uWind: { value: number } }; // shared by both materials
export function meadowMaterial(kind: "grass" | "flower"): THREE.MeshStandardMaterial;
```

Material requirements: `side: DoubleSide`, `roughness 0.95`, `metalness 0`, `color #ffffff` (instanceColor supplies tint), `customProgramCacheKey = () => "meadow-" + kind`. In `onBeforeCompile`: attach `meadowUniforms`; declare `varying vec2 vMeadow` (x = uv.x head mask or blade uv.y, y = visibility); replace `#include <project_vertex>` with: compute `vec3 origin = (modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.)).xyz`, `float d = distance(origin.xz, cameraPosition.xz)`, `float density = 1.0 - smoothstep(uFull, uFade, d)`, `float vis = clamp((density - instanceRandom) / 0.12, 0.0, 1.0)` where `instanceRandom` comes from a per-instance float attribute `meadowRandom`; scale `transformed` by `vis` (height and width), apply instanceMatrix, modelMatrix, then world-space sway `worldPos.xz += uWind * uv.y * uv.y * scale * (sin(uTime*1.3 + worldPos.x*0.35 + worldPos.z*0.2)*0.6 + sin(uTime*2.1 + worldPos.x*0.9 + 1.7)*0.4) * vec2(1.0, 0.6)`; then view/projection. Uniforms `uFull`/`uFade` set from the tier. Fragment: after `#include <color_fragment>`, grass: `diffuseColor.rgb *= mix(0.58, 1.06, vMeadow.x)`; flower: `diffuseColor.rgb = mix(vec3(0.30,0.42,0.22), diffuseColor.rgb, vMeadow.x)`. Fog remains (`fog: true` default).

- [ ] **Step 1: Write failing tests in `apps/web/src/meadow.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { meadowTier, TIERS, canMeadow, chunkWindow, sampleChunk, densityAt, tuftGeometry, flowerGeometry, meadowMaterial, FLOWER_COLOURS } from "./meadow";
import { southShore, cabinSpots, fishingSpots, terrainHeight } from "./geography";

describe("meadow tier", () => {
  it("prefers overrides, downgrades weak or mobile devices", () => {
    expect(meadowTier({ override: "off", mobile: false, renderer: "Apple M2" })).toBe("off");
    expect(meadowTier({ mobile: true, renderer: "Apple M2" })).toBe("low");
    expect(meadowTier({ mobile: false, cores: 4, renderer: "ANGLE (Apple M2)" })).toBe("low");
    expect(meadowTier({ mobile: false, cores: 10, memoryGiB: 8, renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620)" })).toBe("low");
    expect(meadowTier({ mobile: false, cores: 10, memoryGiB: 8, renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro)" })).toBe("high");
  });
});
describe("canMeadow", () => {
  it("keeps plants off water, sand, drawn roads, cabin plots and activity spots", () => {
    const shore = southShore(0);
    expect(canMeadow(0, shore - 5)).toBe(false);           // water
    expect(canMeadow(0, shore + 2)).toBe(false);           // sand band
    const c = cabinSpots[0];
    expect(canMeadow(c.x, c.z)).toBe(false);               // cabin footprint
    expect(canMeadow(c.x + 12, c.z)).toBe(true);           // garden beside the plot (adjust if another exclusion applies; assert at least one of ±12 x is true)
    const f = fishingSpots[0];
    expect(canMeadow(f.x, f.z + 1)).toBe(false);           // fishing clearance
    expect(canMeadow(-150, southShore(-150) + 60)).toBe(true); // open hill
  });
});
describe("chunk window", () => {
  it("is ring×ring, nearest first, stable within a chunk", () => {
    const s = TIERS.high;
    const a = chunkWindow(3, 3, s), b = chunkWindow(12, 9, s);
    expect(a).toHaveLength(49); expect(a).toEqual(b); expect(a[0]).toBe("0,0");
    expect(new Set(a).size).toBe(49);
  });
});
describe("sampleChunk", () => {
  it("is deterministic, bounded by capacity, lands on the terrain and avoids excluded ground", () => {
    const s = TIERS.high, key = `${Math.floor(-150 / s.chunk)},${Math.floor((southShore(-150) + 60) / s.chunk)}`;
    const a = sampleChunk(key, s), b = sampleChunk(key, s);
    expect(a.grassCount).toBeGreaterThan(100); expect(a.grassCount).toBeLessThanOrEqual(s.grassPerChunk);
    expect(a.flowerCount).toBeLessThanOrEqual(s.flowersPerChunk);
    expect(Array.from(a.grass.subarray(0, a.grassCount * 6))).toEqual(Array.from(b.grass.subarray(0, b.grassCount * 6)));
    for (let i = 0; i < a.grassCount; i++) {
      const x = a.grass[i*6], y = a.grass[i*6+1], z = a.grass[i*6+2];
      expect(Math.abs(y - terrainHeight(x, z))).toBeLessThan(0.35);
      expect(canMeadow(x, z)).toBe(true);
    }
    for (let i = 0; i < a.flowerCount; i++) expect(a.flowers[i*7+6]).toBeLessThan(FLOWER_COLOURS.length);
  });
  it("returns no instances for a chunk in open water", () => {
    const s = TIERS.high, r = sampleChunk(`${Math.floor(-10 / s.chunk)},${Math.floor((southShore(-10) - 60) / s.chunk)}`, s);
    expect(r.grassCount).toBe(0); expect(r.flowerCount).toBe(0);
  });
});
describe("density and geometry", () => {
  it("fades from full to zero across the tier radii", () => {
    const s = TIERS.high;
    expect(densityAt(0, s)).toBe(1); expect(densityAt(s.fullRadius, s)).toBe(1);
    expect(densityAt((s.fullRadius + s.fadeRadius) / 2, s)).toBeCloseTo(0.5, 5);
    expect(densityAt(s.fadeRadius + 1, s)).toBe(0);
  });
  it("builds solid blades and flowers with height uv and upward normals", () => {
    const g = tuftGeometry(), f = flowerGeometry();
    const tris = (geo: THREE.BufferGeometry) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    expect(tris(g)).toBe(18); expect(tris(f)).toBeGreaterThanOrEqual(10);
    const uv = g.attributes.uv; let maxY = 0; for (let i = 0; i < uv.count; i++) maxY = Math.max(maxY, uv.getY(i));
    expect(maxY).toBe(1);
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.7);
  });
  it("gives each material kind its own program key and shared uniforms", () => {
    const a = meadowMaterial("grass"), b = meadowMaterial("flower");
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
    expect(a.side).toBe(THREE.DoubleSide);
    expect(a.userData.meadowUniforms).toBe(b.userData.meadowUniforms);
  });
});
```

- [ ] **Step 2: Run `npx vitest run apps/web/src/meadow.test.ts`** — expected FAIL: module not found.
- [ ] **Step 3: Implement `apps/web/src/meadow.ts`** per the Interfaces block. Use `rng(seed)` from geography with a 32-bit string hash of the key. Keep all sample arrays preallocated at capacity. Grass yaw random, scale 0.75–1.25 × lowNoise; flower scale 0.8–1.2. Export the shader injection via `meadowMaterial` only (no separate file).
- [ ] **Step 4: Run the tests** — expected PASS. Then `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `git add apps/web/src/meadow.ts apps/web/src/meadow.test.ts && git commit -m "Add meadow placement core, blade geometry and wind material"`.

### Task 2: `Meadow.tsx` chunk streaming component and Game wiring

**Files:**
- Create: `apps/web/src/Meadow.tsx`
- Modify: `apps/web/src/meadow.ts` (add the pure scheduling helpers below), `apps/web/src/meadow.test.ts`
- Modify: `apps/web/src/Game.tsx` (mount `<Meadow />` next to `<Vegetation flat={flat} />`, inside the same `<group>`; pass `forceHigh={performanceLab}`)

**Interfaces:**
- Consumes Task 1: `TIERS`, `meadowTier`, `chunkWindow`, `sampleChunk`, `tuftGeometry`, `flowerGeometry`, `meadowMaterial`, `meadowUniforms`, `FLOWER_COLOURS`.
- Produces (in `meadow.ts`):
```ts
export type SlotPlan = { build: { key: ChunkKey; slot: number }[]; clear: number[] };
/** Keys leaving the window free their slot; new keys take free slots nearest-first. Slots count === ring*ring. */
export function planChunkUpdates(current: Map<ChunkKey, number>, next: ChunkKey[], slotCount: number): SlotPlan;
export function windAmplitude(reducedMotion: boolean): number; // 0 when reduced, else 0.09
```
- Produces (in `Meadow.tsx`): `export function Meadow({ forceHigh = false }: { forceHigh?: boolean })`.

Component behaviour:
- Tier: `useMemo` from `meadowTier({ override: diagnostics ? URLSearchParams(location.search).get("meadow") : null, cores: navigator.hardwareConcurrency, memoryGiB: (navigator as any).deviceMemory, mobile: /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) || matchMedia("(pointer: coarse)").matches, renderer: gl.getContext().getExtension("WEBGL_debug_renderer_info") ? UNMASKED_RENDERER_WEBGL : "" })`; `forceHigh` → "high". `"off"` renders null.
- Two `InstancedMesh`es sized `ring² × grassPerChunk` and `ring² × flowersPerChunk`, `frustumCulled = false`, `castShadow = false`, `receiveShadow = true`, `instanceColor` allocated, extra `InstancedBufferAttribute("meadowRandom", 1)`. Matrices start all-zero. Set `instanceMatrix.setUsage(DynamicDrawUsage)`; same for colour/random.
- `useFrame`: `meadowUniforms.uTime.value += dt` (clamped dt ≤ 0.1). Compute camera chunk `(floor(cam.x/chunk), floor(cam.z/chunk))`; only when it changed, `chunkWindow` → `planChunkUpdates` → push builds onto a queue (replace the queue, not append). Then while queue non-empty and `performance.now() - frameStart < 3` ms: pop the next build, `sampleChunk`, write the slot range (matrix via a module-level reusable `Object3D`/`Matrix4`, colour, random), zero the remaining slots in the range, `addUpdateRange` for matrix/colour/random, `needsUpdate = true`. Cleared slots (keys that left) are zeroed immediately with their own update range. No allocation inside the loop except the sample arrays returned by `sampleChunk` (acceptable: at most a few per frame while moving; reuse one preallocated `ChunkSample` if easy).
- Adaptive guard (skipped when `forceHigh`): after 6 s, if the mean of the last 120 frame deltas exceeds 28 ms for 3 consecutive seconds at "high", switch to "low" once (remount with the lower tier). Keep a single `setState`.
- `prefers-reduced-motion`: `meadowUniforms.uWind.value = windAmplitude(matchMedia("(prefers-reduced-motion: reduce)").matches)`, updated on change.
- Unmount: dispose both meshes (geometries/materials are page-lifetime singletons, `dispose={null}`).

- [ ] **Step 1: Add failing tests to `meadow.test.ts`**

```ts
describe("planChunkUpdates", () => {
  it("keeps existing chunks, frees departed slots and reuses them for new keys nearest-first", () => {
    const current = new Map([["0,0", 0], ["1,0", 1], ["9,9", 2]]);
    const plan = planChunkUpdates(current, ["0,0", "1,0", "0,1"], 4);
    expect(plan.clear).toEqual([2]);
    expect(plan.build).toEqual([{ key: "0,1", slot: 2 }]);
  });
  it("never exceeds the slot count when the whole window changes", () => {
    const current = new Map(Array.from({ length: 49 }, (_, i) => [`${i},100`, i] as const));
    const next = chunkWindow(0, 0, TIERS.high);
    const plan = planChunkUpdates(current, next, 49);
    expect(plan.build).toHaveLength(49);
    expect(new Set(plan.build.map((b) => b.slot)).size).toBe(49);
    expect(plan.build[0].key).toBe(next[0]);
  });
});
it("silences wind under reduced motion", () => {
  expect(windAmplitude(true)).toBe(0); expect(windAmplitude(false)).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the tests** — expected FAIL (missing exports).
- [ ] **Step 3: Implement `planChunkUpdates` and `windAmplitude` in `meadow.ts`; write `Meadow.tsx`; mount in `Game.tsx`.**
- [ ] **Step 4: Run `npx vitest run apps/web/src/meadow.test.ts`, `npx tsc --noEmit`, `VITE_GAME_DIAGNOSTICS=1 npm run build`** — all pass.
- [ ] **Step 5: Commit** `git add apps/web/src/Meadow.tsx apps/web/src/meadow.ts apps/web/src/meadow.test.ts apps/web/src/Game.tsx && git commit -m "Stream camera-following grass and wildflower chunks"`.

### Task 3: Measure, tune, capture and document (orchestrator-led; one implementer for tuning fixes)

- [ ] **Step 1:** Build `VITE_PERFORMANCE_LAB=1 VITE_GAME_DIAGNOSTICS=1 npm run build`; when 4173 is free, one `npm run preview`; same scenarios/views/method as Task 0 → `docs/meadow/perf/after-*.json`; captures `docs/meadow/captures/after-{shore,hill,close,dusk}.png` matching the before views; also check `?time=0` (night) reads well.
- [ ] **Step 2:** If added cost > ~2 ms/frame or > ~10 draw calls, or crowd < 30 fps: lower `grassPerChunk`/`fadeRadius` in `TIERS.high` and re-measure. Ledger the final numbers.
- [ ] **Step 3:** Write `docs/meadow/README.md`: owner request, approach, tiers and overrides (`?meadow=off|low|high`), before/after table with method and hardware, capture paths, rulings with cost-if-wrong, deferred items.
- [ ] **Step 4:** Rebuild a normal `npm run build` (no lab flags) so `dist/` is production-shaped; stop the preview; `lsof -nP -iTCP:4173 -sTCP:LISTEN` shows nothing.
- [ ] **Step 5:** Commit docs and captures: `git add docs/meadow && git commit -m "Document meadow performance and captures"`.
