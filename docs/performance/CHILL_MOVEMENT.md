# Chill movement load check — 30 October 2026

Measured on Apple M4 Pro / 48 GiB, in-app Chromium, 1707×960 CSS pixels, DPR 1.5. Each result is a rolling 600 visible-frame window after warmup, at the same fixed arrival camera and noon lighting. Baseline is released main `190d7bd`; candidate is `3031387`. This is a local render comparison, not an internet loading or Cloudflare capacity test.

| Scene | Baseline fps | Candidate fps | Baseline p95 | Candidate p95 |
| --- | ---: | ---: | ---: | ---: |
| Solo, one cabin | 120.0 | 120.0 | 8.5ms | 10.0ms |
| 50 cabins, 49 nearby walkers | 78.3 | 74.4 | 15.0ms | 16.2ms |
| 50 cabins, 49 nearby scooter riders | 67.4 | 65.5 | 17.2ms | 17.9ms |
| 50 cabins, 49 mixed crouch/crawl poses | — | 74.4 | — | 16.0ms |
| 50 cabins, 49 distant players | — | 115.4 | — | 10.6ms |

No measured sample had a frame above 33ms. Walkers were about 5% slower and riders about 3% slower in this run. Conservative animated bounds draw some additional edge-of-view character parts to preserve hair/clothes in low poses. The change is a correctness/performance tradeoff; it is not a claim of zero overhead or a hardware-independent 60fps guarantee.

Loaded geometry, texture and material counts match baseline in the equivalent solo/walker/rider scenes. Near-avatar samples used 280 GPU geometries / 100 textures / 918 scene materials. Moving the 49 remotes to the distant fixture reduced textures to 51, scene objects from 7,406 to 2,800, and materials to 477. This verifies active avatar resources are released when rigs leave the near range; immutable model caches remain deliberately available. Mesh counts in the equivalent scenes did not grow. The candidate adds one lightweight presence-anchor group per visible remote avatar.

The two authored crouch clips and baked prone clips add about 56 KB compressed to the existing action JSON. Parsed data for every pre-existing action clip was checked unchanged. No runtime retargeting factory, new character mesh, or texture family is required.

## Reproduction and limits

The existing PerformanceLab was rendered through temporary internal HTML fixtures on the same 4173 listener so the shrub-review page did not have to be replaced. Both wrappers use the actual Game and its fixed camera, noon light and renderer counters. Each version's own action JSON was pinned using the current Three FileLoader `file:` cache key, with no network fetch for the shared action file. The baseline received only the same offline-transport isolation guard used by the candidate. Startup times are excluded because the fixture bundling is not normal Vercel packaging.

A normal reproduction uses `VITE_PERFORMANCE_LAB=1 VITE_GAME_DIAGNOSTICS=1 npm run build`, coordinated with the release owner on the existing 4173 server. Select the scene, reset measurement, allow the 3-second warmup and at least 600 frames, and keep the viewport/camera/focus unchanged. Circle phase and OS scheduling can affect small differences. Restore a normal build afterward. Never deploy the performance fixture.

Rounded raw counters and environment are in `results/chill-movement-2026-10-30.json`. Gameplay collision/input correctness is covered separately by the real-controller fixture and paired-client evidence.
