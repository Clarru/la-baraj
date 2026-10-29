# Environment finish — 29 October 2026

The roads now have a continuous joined surface, fine asphalt texture and feathered verges. Grass has subtle painted detail that fades off the sandy shoreline. A static gradient sky, distant hill apron and reused tree silhouettes replace the white finite-map horizon.

## Comparable runtime measurements

Local desktop run on Apple M4 Pro in the in-app Chromium browser. Fixed **1707×960 CSS pixels, DPR 1.5**, fixed arrival camera `[50.4192479998657, 8.403607426127289, 56.762402419907936]`, same scene fixtures, 3s warmup and a 600-frame rolling sample. Baseline is release `5aea62b`, with only the same local camera/viewport measurement helper copied into a temporary export. No extra game server was started. Rider and walker controls were rerun immediately before the final feature sample to check that machine conditions had not invalidated the earlier baseline.

| Scene | Baseline fps | Final fps | p95 frame time | Draw calls / frame |
| --- | ---: | ---: | ---: | ---: |
| Solo | 120.0 | 120.0 | 8.9 → 9.4ms | 320 → 320 |
| Walkers | 89.0 | 90.3 | 14.8 → 15.1ms | 1543 → 1503 |
| Riders | 75.1 | 74.2 | 17.2 → 17.6ms | 1603 → 1573 |

Solo = one cabin and local player. Walkers/riders = 50 cabins, local player and 49 animated nearby players. These are render/physics load fixtures, not 50 remote network clients. All six raw samples are in `results/environment-finish/`. No frame in these final windows exceeded 33ms. Scene physics counts match the baseline (solo: 31 bodies / 296 colliders; crowd: 80 / 345).

The final rider scene is about 1.3% slower than the adjacent baseline; walkers are about 1.4% faster and solo remains at the 120Hz display limit. This is local evidence, not a promise of the same frame rate on every PC. Final first scene frame was 2.27s versus 2.26s in the earlier baseline, both localhost measurements; this is not a cold Internet-load benchmark.

An intermediate 30Hz-reflection version lost meaningful crowd performance and was not shipped. Reflected scenery now updates at **20Hz**, while waves animate every frame and reflection resolution remains 512×512. This reduces repeated crowd rendering. Other final changes limit texture anisotropy to 4, draw the sky after opaque scenery so hidden pixels fail depth testing, and use MSAA alpha-to-coverage for road edges where supported. Non-MSAA contexts retain the blended road fallback.

Earlier uncontrolled captures had different viewport dimensions or camera positions and were excluded. GPU texture counts after different camera tours also reflect loader caches, so they are not used to claim memory improvements.

## Cost and resource limits

- Two 512px WebP assets total **141,488 bytes**. Net live texture count increases by one because the old canvas ground texture is replaced. Exact prompts and source hashes are in `../art-direction/environment-finish/` and adjacent runtime sidecars.
- Hills: one static unlit mesh, **965 vertices / 1,536 triangles**, no shadows or physics. Its colors bake the atmospheric depth; no per-frame terrain deformation.
- Far forest: **2,400** crossed-plane instances, at most **9,600** triangles per visible pass, merged into the same existing four species batches. No additional detailed tree models or downloads.
- Nearby full-detail tree assets and their LOD thresholds stay fixed. Natural-object collision bodies remain restricted to the existing 85–100m active radius; squared-distance checks avoid repeated square roots.
- Terrain collision positions, shoreline, roads' centerlines, cabin ownership/plots, multiplayer state and housing epoch are unchanged. Approved `Lakeside_Man.glb` SHA256 remains `1c89c5710998736679a7a10403e89f998a912624c1fe674959668364bd2ba520`.

## Verification

142 frontend tests and 69 server tests pass; server TypeScript and production build pass. Four new geometry tests cover road continuity, upward normals, verge alpha, invalid/duplicate road points, scenery bounds/budget and background clearances. Existing real Rapier terrain/raycast and lake boundary tests pass.

Runtime screenshots cover the road, lake and all four horizon directions. No browser console/WebGL errors were observed in the final local run. Normal production build excludes the performance fixture, camera/view controls and movement metrics. Public multiplayer verification follows Vercel publication; no Worker deployment or world storage migration is involved.
