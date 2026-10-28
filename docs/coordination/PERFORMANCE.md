# Desktop performance pass — 28 October 2026

Scope: a bounded optimization of `apps/web/src/environment.tsx`. No changes to vegetation density, tree LOD distances, texture/material appearance, water resolution, shadows, house assets, or terrain geometry. No mobile work or benchmark framework.

## Concrete finding and fix

App publishes renderer metrics into React state once per second. Previously every such render rebuilt the vegetation's 100 m placement groups. New placement-array identities triggered `InstanceBatch` matrix/bounding-sphere updates and recreated `DistantTrees` meshes/materials, including hidden but mounted LOD children. This caused repeated CPU allocation and GPU instance-buffer churn unrelated to anything changing in the forest.

- Placement groups are now computed once from the existing deterministic placement data.
- `Vegetation` is memoized; metrics/UI updates with the same `flat` setting leave the forest alone.
- All distant-tree batches share one geometry/material per species. Each batch retains independent transforms and bounds for existing culling behavior.
- Batch cleanup disposes its own instance buffers. Parent cleanup owns the four shared geometry/material pairs; texture ownership remains with Drei's loader cache.
- Drei `Detailed` already updates each LOD from the active camera in its `useFrame`. `autoUpdate={false}` avoids Three repeating LOD selection during main/reflection renders and keeps both passes on the same selected representation.
- Terrain meshes and fixed rigid bodies carry `userData.terrain=true`; the mesh is named `lake-terrain`. This supports terrain-only grounding raycasts and has no visual effect.

The terrain render remains one continuous mesh and collider. Chunking it would add draw calls and needs separate evidence before expanding this capped pass.

## Source-level evidence

A temporary Vite SSR inspection evaluated the actual deterministic placement data without changing source exports:

| Measure | Current value |
| --- | ---: |
| Near-bank tree instances | 1,201 |
| Far-bank tree instances | 3,500 |
| Ground plants | 1,923 |
| Rocks | 283 |
| Near vegetation clusters | 190 |
| Total vegetation groups | 194 |
| Impostor instance batches | 107 |
| Independent impostor geometries/materials before | 107 / 107 |
| Independent impostor geometries/materials after | 4 / 4 |

This eliminates 103 independent impostor geometries and 103 material objects while preserving all 107 instance batches. It does **not** claim a draw-call reduction. Original impostor geometry identities were stable across metric updates; the repeated allocations were their meshes/materials/instance buffers and regrouped placement arrays.

Original GLB source complexity: CommonTree_1 6,265 triangles, CommonTree_3 3,505, Pine_2 3,648, Pine_4 3,370; each has two primitives/materials. The existing nearby detailed trees therefore still account for substantial triangle work. Their models and distance thresholds remain intact.

## Runtime measurement and limits

Root-provided pre-change reference, production preview 4173: one-character walking view, 1089.7 × 1180.6 CSS pixels, DPR 1, 600-frame rolling window: 117 fps mean; 8.5335 ms mean; 9.7 ms p95; 846 complete-frame calls; 3,935,371 triangles; 846 geometries; 124 textures. An older survey view had approximately 26 fps and 4,505 calls, but is not a matched comparison.

These references include main/reflection/shadow passes. They are not isolated timings for vegetation. House/animation/activity work is concurrent, so an integrated post-change measurement alone cannot attribute an fps difference to this optimization.

For a useful before/after check: serve the isolated production build, retain the same viewport/DPR, one-character/crowd setting, time of day, camera pose and view mode; allow loading and shader compilation to finish; wait for 600 samples; record the authored metrics output. Check both walking and survey views. Watch sustained motion through several metric updates for periodic hitches. Compare geometry/material allocation behavior as well as mean/p95 timing. No fps improvement is claimed without that observation.

## Verification

- `npx tsc --noEmit`: passed.
- `npm test`: 5 files, 26 tests passed (the existing Three CommonJS deprecation warning remains).
- `npx vite build --outDir ../../dist-performance`: passed. Isolated output is `<repo>/dist-performance`; no deployment or shared preview overwrite. Vite reports its existing large-main-chunk advisory (~4.08 MB JS / ~1.31 MB gzip); this pass does not change delivery architecture.

No additional UI benchmark framework or low-impact implementation-mirroring test was added.
