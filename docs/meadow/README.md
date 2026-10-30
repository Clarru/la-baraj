# Meadow: grass and wildflowers — 30 October 2026

Branch `meadow`, cut from main `462252f`. Plan: [plan.md](plan.md).

## Owner request

The world looked barren: the ~2,300 instanced MegaKit plants in `environment.tsx` only cover a band around the cabins, and the open banks, hills and clearings were bare painted terrain. Add grass and flowers across the land without losing frame rate: player-following chunks within ~40–60 m, density and fade falling off with distance (no pop), instanced with few draw calls, solid blade geometry, no shadow casting, wind in the vertex shader, no hitching chunk rebuilds, clumped wildflower patches in the DESIGN.md palette, nothing on sand, water, roads, cabin footprints, activity spots or the dock, a quality tier for weak devices, and a good read at day, dusk and night.

## What was built

- `apps/web/src/meadow.ts` — the pure core. Quality tiers (`TIERS.high`: 16 m chunks, 7×7 window, full density to 26 m, zero at 48 m, 400 tufts + 96 flowers per chunk; `TIERS.low`: 5×5 window, 14/30 m, 190 + 48), `meadowTier()` (mobile, ≤4 cores, ≤4 GiB or an Intel/SwiftShader/Mali/Adreno renderer → low), `canMeadow()` (not water, shore distance > 4 m, drawn-road distance > 3.2 m, `activityClearance`, no cabin plot within 7.5 m, dock clearance 16 m), the chunk window, a resumable per-chunk sampler (geography evaluated on a 2 m grid, 81 samples per chunk, split across frames; tufts derive heights bilinearly; a 512-entry grid cache makes revisits free), deterministic per chunk key. Solid geometry: a tuft is 6 blades × 3 triangles with upward-biased normals so it shades like the ground; a flower is a 2-quad stem plus a 6-triangle cupped head. `meadowMaterial(kind)` is a `MeshStandardMaterial` patched in `onBeforeCompile`: per-instance random + camera distance give a smooth grow-in/shrink (no pop), world-space sway from `uTime`/`uWind`, base-to-tip darkening on grass, stem green vs. `instanceColor` petals on flowers, two-sided lighting without the back-face normal flip. Fog, hemisphere/sun/ambient lighting and shadow receiving come from the standard material, so the day-night palette applies automatically.
- `apps/web/src/MeadowLayer.tsx` — the R3F component `Meadow`. Two `InstancedMesh`es (all grass, all flowers), `frustumCulled=false`, `castShadow=false`, `receiveShadow=true`. Each of the 49 (or 25) window chunks owns a fixed slot range; builds write only that range and upload it with `addUpdateRange`. `useFrame` does nothing per instance: it advances `uTime`, detects a camera chunk change, and spends at most 3 ms per frame stepping the nearest unbuilt chunk. An adaptive guard downgrades high → low once if the 120-frame mean stays above 28 ms for 3 s after a 6 s warm-up (frames over 250 ms are ignored, so a tab resume cannot trigger it; disabled in the performance lab). `prefers-reduced-motion` sets the wind amplitude to 0. Nothing here is a collider.
- `apps/web/src/Game.tsx` mounts `<Meadow forceHigh={performanceLab} />` beside the existing `<Vegetation>`; the MegaKit plants are unchanged. `geography.ts` exports `FISHING_CLEARANCE` and `SHARED_GROUND_CLEARANCE` so the sampler and `activityClearance` share one source. The localhost-only performance lab gains a "Meadow at eye height" view.
- Diagnostics builds (`VITE_GAME_DIAGNOSTICS=1`) accept `?meadow=off|low|high`.

Flower colours: cream `#f3e5c9`, violet `#7e648d`, ochre `#a8622b`, muted yellow `#d8b85a`; each ~12 m patch has a dominant colour with 20 % strays. Grass tint `#4a6636`–`#6b8545`, matched to the painted terrain (`#69844b` × its detail mask).

## Performance

Hardware: MacBook Pro 14" (Mac14,10), Apple M2 Pro, 16 GB, macOS 27.0. Chrome 150 in a separate profile launched with `--disable-gpu-vsync --disable-frame-rate-limit`, so frame time is real render cost rather than a vsync-pinned 120 Hz. Metrics are the performance lab's own 600-frame rolling window (`VITE_PERFORMANCE_LAB=1 VITE_GAME_DIAGNOSTICS=1 npm run build`, `?time=12`, 1707 × 960 CSS px at DPR 1.5, offline, same fixed camera per view), read through the DevTools protocol; raw samples are in [perf/](perf/). "Before" is this branch's merge base (main `462252f`), served from the same preview from a saved copy of its `dist/`; "after" is `6d72d9a`. Draw and triangle totals include the water reflection pass; the meadow does not cast shadows, so it is absent from the shadow pass.

| Scenario / view | Before fps · mean · p95 | After fps · mean · p95 | Draws before → after | Triangles before → after |
| --- | --- | --- | --- | --- |
| Solo, arrival (close-up near spawn) | 258.9 · 3.86 ms · 6.2 ms | 241.8 · 4.14 ms · 6.2 ms | 345 → 347 | 2.08 M → 2.51 M |
| Solo, north (hill under the tree line) | 208.7 · 4.79 ms · 9.6 ms | 178.2 · 5.61 ms · 11.5 ms | 540 → 547 | 1.91 M → 2.37 M |
| Solo, across the lake (shore) | 74.8* · — | 277.4 · 3.60 ms · 6.2 ms | 336 → 340 | 2.03 M → 2.47 M |
| Solo, arrival at dusk (`?time=19.5`) | 275.0 · 3.64 ms · 5.3 ms | 246.0 · 4.07 ms · 7.1 ms | 340 → 343 | 2.05 M → 2.49 M |
| 50 cabins / 49 nearby walkers, arrival | 93.3 · 10.71 ms · 15.1 ms | 83.2 · 12.02 ms · 17.3 ms | 1555 → 1563 | 4.49 M → 5.00 M |

\* the first lake sample included view-switch loading frames (380 frames, mean skewed by a few long frames); treat the shore row as a capture, not a timing.

Because the crowd scenario is CPU-bound and drifted during the session, three interleaved before/after pairs were taken back to back (`perf/before2-*`, `before3-*`, `after2-*`, `after3-*`): solo arrival 4.13/3.98 ms before vs 4.61 ms after; crowd 13.99/14.16 ms before vs 16.12/15.04 ms after (the crowd had slowed to 70 fps on both builds by then). Run-to-run noise is about ±1.5 ms on the crowd, so the honest reading is: **about +0.3–0.8 ms per frame on solo views, roughly +1–2 ms in the 49-avatar crowd, +2 draw calls per pass (3–8 in totals), and about +440 k submitted triangles** (every slot's triangles count in `gl.info`, including faded zero-scale instances). The crowd stays above 60 fps on this machine against the PRD's 30 fps target; a weak device gets the low tier (about half the instances, 5×5 window) or the adaptive downgrade. CPU work in `useFrame` is one uniform update plus a bounded ≤3 ms chunk step while chunks are being filled; the lab's long-task list shows no new long tasks beyond the startup asset/shader stalls present on main.

## Captures

Same lab views before and after, `captures/`:

- `before-close.jpg` / `after-close.jpg` — arrival view near spawn (day).
- `before-hill.jpg` / `after-hill.jpg` — north view on the hill under the tree line.
- `before-shore.jpg` / `after-shore.jpg` — across the lake from the dock (sand bank stays bare by design).
- `before-dusk.jpg` / `after-dusk.jpg` — arrival view at `?time=19.5`.
- `after-eye-level.jpg`, `after-eye-level-dusk.jpg`, `after-eye-level-night.jpg` — the new eye-height lab view on the open hill at day, dusk and `?time=0` (no "before" exists for this view; main's lab has no such camera).

## Rulings made along the way

- Chunks follow the camera's x/z, not the player, so survey and lab cameras get grass too. Cost if wrong: the ring sits ~5 m behind the player in third person.
- Footpaths (`path`, `footway`, `track`, …) are not drawn by the road ribbon, so grass may cover them; only drawn roads get the 3.2 m clearance. Cost if wrong: one constant.
- One `InstancedMesh` per kind with fixed per-chunk slot ranges instead of a mesh per chunk (2 vs 49 draw calls per pass; no frustum culling, degenerate instances still cost vertex work and inflate the triangle metric).
- Distance thinning/fade in the vertex shader from a per-instance random; nothing per instance in JS.
- Component file is `MeadowLayer.tsx` because macOS's case-insensitive filesystem makes `./Meadow` resolve to `meadow.ts`.
- Cabin clearance 7.5 m (plus the 1.5 m grid margin) rather than the 18 m the MegaKit scatter uses; shared grounds, fishing spots and the dock keep their owner-mandated radii, so the lawn around the spawn cabin and fire circle is bare on purpose.
- Two reviewer minors fixed as rulings: the visibility formula no longer culls 12 % of tufts at full density; two-sided lighting ignores facing so back faces are not lit from below.
- Resumable chunk builds plus a grid cache to hold the 3 ms budget on slower CPUs.
- Flower heads shrunk and cupped (0.10 m, ring 3 cm below the centre) after the first captures read as flat plates; a dev-only eye-level lab view was added for reproducible player-height captures.
- Commits use the worktree's configured identity (`georgeab550`) per the task brief, although AGENTS.md names a different required author; the release owner should decide before merging.

## Deferred

- Tests: `canMeadow` has no explicit drawn-road/footway/dock assertion; flower positions are not asserted against the terrain; the sampler's shared-ground radius is not covered; the stepped-vs-one-shot equivalence test shares the grid cache; `windAmplitude(false)` is asserted `> 0` rather than `0.09`.
- `MeadowLayer.tsx` has no automated test (R3F); verified in the lab captures above.
- Small code polish: `plan.clear.includes(slot)` is O(n·m) on chunk change (≤49 entries); guard deltas are not reset on a tier change; the `uTime` frame hook still runs when the tier is `off`.
- The meadow is drawn in the water reflection pass (at 512 px, 20 Hz); excluding it would save a little GPU time at the cost of bare reflected banks.

## Reproduce

Node 24, this worktree, the single shared preview on 127.0.0.1:4173 only when it is free (`lsof -nP -iTCP:4173 -sTCP:LISTEN`). Build `VITE_PERFORMANCE_LAB=1 VITE_GAME_DIAGNOSTICS=1 npm run build`, run one `npm run preview`, open `http://127.0.0.1:4173/?time=12`, pick a scenario and view, reset measurement, wait for 600 frames. For unthrottled numbers launch a separate Chrome profile with `--disable-gpu-vsync --disable-frame-rate-limit`. Restore a normal `npm run build` afterwards; the lab and the `?meadow=` override are absent from production builds.
