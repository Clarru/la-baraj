# La Baraj desktop performance — 28 October 2026

Measured against main `135f802`, with matching local production-build fixtures at the same camera, 1707 × 960 CSS pixels and DPR 1.5. Hardware: Apple M4 Pro, 48 GiB RAM; in-app Chromium browser, 120 Hz display. These are local desktop results, not a hardware-independent frame-rate guarantee or a cold internet loading benchmark.

## Results

Each steady-state sample contains 600 frames after warm-up. Draw/triangle totals include the main view, water reflection and shadows. Raw measurements are in [results/](results/).

| Scenario | Before | After | Before p95 | After p95 |
| --- | ---: | ---: | ---: | ---: |
| One cabin, solo | 120 fps | 120 fps | 8.9 ms | 8.8 ms |
| 50 cabins, 49 nearby walkers | 48.2 fps | 78.9 fps | 22.6 ms | 17.1 ms |
| 50 cabins, 49 nearby scooter riders | 30.0 fps | 72.5 fps | 35.1 ms | 17.2 ms |
| 50 cabins, 49 distant players | 65.3 fps | 120 fps | 16.6 ms | 9.4 ms |

The nearby fixtures circle 49 remote avatars within 8–14 m of the arrival. The rider fixture deliberately retains the Walk mixer while applying the scooter pose, stressing both animation and IK. This is the same input before and after. Distant avatars are 650 m away. Remote players follow the actual game architecture: local client physics, network-driven remote visuals.

- First scene-frame callback on a local reload with warm files: **22.1 s → 2.2 s**. The before trace shows approximately fifteen repeated terrain-generation stalls of 1.25–1.3 s. This measures scene initialization, not the time a new player's browser spends downloading all assets over the internet.
- Nearby 49-player GPU textures: **561 → 111**. The unchanged character now shares equivalent skeletons within each avatar; skeleton textures are disposed when that avatar unloads.
- Rider draw calls: approximately **3,632 → 1,598**. Part/material instancing preserves the exact scooter meshes, independent steering and wheel transforms. A full crowd batch can submit some off-camera instances; this tradeoff is included in the measured result.
- Solo triangles submitted: **3.59 million → 2.12 million** per frame. Water waves still animate every frame at the same 512px reflection resolution; the reflected world updates at most 30 times per second. The existing far-tree impostors replace detailed tree clusters at 120 m instead of 160 m, with the existing hysteresis.
- Runtime static models covered by the compression pass: **13,114,764 → 8,308,972 bytes**, a 36.6% reduction. Sixteen models benefit; seven small/textured props retain their originals because encoding saves less than 10%. No geometry simplification, vertex quantization, material edits or texture recompression is applied.
- No cabin interior GLBs appear in the outdoor cold-page resource list. Previously all three loaded immediately, totalling **2,212,696 bytes**. The matching interior now prefetches only when its door prompt becomes relevant.

## Fixes

1. Terrain and road geometry are immutable page-lifetime resources. React discards `useMemo` values when an initial render suspends; using component-local memoization regenerated the terrain for each newly loaded model. The cache survives those retries. Terrain generation, topology, elevations, physical surfaces and cabin plots remain unchanged.
2. Cabin cutaway geometry is constructed only while that cabin is open, and disposed on exit. Incoming friends' cabin assets have their own Suspense boundaries, so a new archetype/font does not hide the running world. The arrival cabin still gates the initial loader.
3. Character meshes share a skeleton only when the bone objects and inverse-bind matrices match exactly. Each player keeps separate animated bones and a mixer; immutable clips are shared. Regression tests compare skinned vertices under Idle, Walk and Run. The character GLB is byte-for-byte unchanged: SHA256 `1c89c5710998736679a7a10403e89f998a912624c1fe674959668364bd2ba520`.
4. Remote rigs mount within 220 m of the camera and unload beyond 250 m. Network presence remains intact. This bounds animation, IK, name badge and bone-texture work without a remount storm at the range edge.
5. Walking remotes have no hidden scooter. Scooters share immutable geometry/materials and use fleet instance batches while riding. Stable speed/steering reuses the solved local rider pose after mixer updates. Tests verify contacts through world movement, rotation and remounting.
6. Repeated scenery props share prepared materials. Natural colliders use the same individual GLTF loader keys as their visual models, avoiding duplicate fetch/parse paths. Instance-buffer cleanup preserves shared model geometry/materials.
7. Empty 3D sign text starts at zero instances until Troika's first glyph sync, avoiding transient infinite instance counts during rapid cabin mount/unmount tests. Its explicit base materials belong to R3F, so unmounting also disposes Troika's derived shader materials instead of leaking the default clones. The canvas explicitly selects the PCF shadow mode that the current Three version already uses, avoiding a removed PCFSoft fallback.

The six architectural designs, character appearance, nearby full-detail models, water resolution, shadow resolution, density, collisions, world identity and saved ownership are preserved. Shared models stay in a bounded cache after use; evicting a model every time it leaves the camera would create download/decode and GPU-upload hitches.

## Final browser and build checks

- **130 frontend tests**, **31 protocol/load tests**, server TypeScript and the normal production build pass.
- Five complete 50-cabin/49-avatar load/unload cycles were checked by actual badge counts and screenshots. All 49 avatars mounted each time; no whole-world loading overlay appeared. After unloading, the scene returned to 120 fps, 150 scene materials, 62 GPU textures and 57 shader programs with the six-model cache warm. Bone textures and fleet instance buffers are released; cached model geometry is retained deliberately. The final 600-frame solo window has no frames over 33 ms and finite draw/triangle counts.
- Jump_Start → Jump_Loop → Jump_Land → grounded Idle_Neutral verified through movement diagnostics. Scooter mounting, approximately 17 m of forward travel in a two-second input, braking, parking and reset were exercised.
- Walking to the cabin prefetches only `Lake_Interior_Sage.glb` (431,188 bytes for this archetype). Entry is grounded, with the matching room visible. Exit releases cutaway/interior geometry: **154 → 185 → 154** GPU geometries. The room asset remains cached for the next visit.
- Porch bench sit-down reaches grounded Activity_Sit; stand-up responds. Fishing/catch state and animation coverage remain automated tests; no full manual fishing session is claimed.
- The normal compiled JS is checked for absence of the performance picker, fixture players and movement diagnostics. Stress-test tabs are closed and the single shared preview is restored to the normal build.

## Multiplayer stress verification

`npm run test:protocol` includes the actual parser, room core and persistent home allocator under **30 and 50 concurrent owners**. Each case runs ten simulated minutes at 8 pose messages per second, then contested seating and reconnects. A separate flood case checks that a misbehaving connection is closed without disrupting a healthy peer or retaining its seat.

The 50-player case processes **240,000 inbound poses** and **11,760,000 deliveries**, with zero pose-triggered persistent storage writes. This run took about 2.34 seconds of local execution; it is **not** a Cloudflare CPU-budget or real-network latency measurement. Simulated aggregate outbound traffic was 2.38 GB per ten minutes, approximately **77.6 KiB/s per receiving player** when all 50 move continuously. The actual client suppresses unchanged poses and sends no faster than its existing 120 ms interval.

The deployed Worker also passes the existing 13-check read-only websocket smoke harness, covering health, exact origins, canonical-world aliases, server identity, presence, seat/fire snapshots, roster sync and departures. Those checks allocate no homes and mutate no saved gameplay. No deployed-world mass-load test or backend deployment is needed for these frontend changes.

## Reproduce safely

Use Node 24 and this task's worktree. There is one shared preview server, `http://127.0.0.1:4173/`; do not create another listener.

```sh
npm test
npm run test:protocol
npm run server:check
VITE_PERFORMANCE_LAB=1 VITE_GAME_DIAGNOSTICS=1 npm run build
```

Coordinate copying this build to the existing shared `dist/`. The performance scenario picker is compiled only for the explicit opt-in build and runs only on localhost. That mode forces the room client offline even if a live Worker URL is configured. Fake owners, cabins and remote poses never enter the deployed world.

Allow loading and shader compilation to finish. Choose a scenario, reset measurement, and collect at least 600 frames. Keep viewport, DPR, camera, scenario and focus consistent. The output exposes frame timing, complete-frame calls/triangles, renderer resources, physics counts/timing, startup long tasks and fetched asset names. Do not compare cached JS heap snapshots as if they measured a memory leak; garbage collection is nondeterministic. Use repeated resource counts and cleanup behavior alongside the trace.

For static model exports, run `node scripts/compress-static-assets.mjs` as the final pipeline step. It verifies decoded vertex attributes, triangle winding and texture bytes, records hashes in [static-compression.json](../../apps/web/public/assets/static-compression.json), and keeps originals when encoding is not useful. It does not process the character. Uncompressed source models and earlier repository history remain available.

Before release, run a normal `npm run build`. Verify that the compiled files contain neither the performance picker nor movement diagnostics. Production has no performance/testing UI.
