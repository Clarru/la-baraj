# Mobile input and work-budget verification

The owner's physical iPhone 15 Pro / installed Safari report rejected the first mobile release. Runtime candidate `44346d984e883817e921a550a2cc24015fee77cb` on PR #64 replaces that control path and reduces the measured rendering workload. Physical-phone acceptance remains open.

The unchanged baseline was frozen main `8388736`. The candidate used the actual Game/Player/Ecctrl/Rapier, a separately prefixed LocalWorldRoom worker and authored local positioning. Both used the same WebGL/RAF counter wrappers in Chrome 156.0.8078.79 with ANGLE Metal, 393×852 CSS pixels, DPR3 device emulation, touch, iPhone UA and an installed-app hint. These are Mac workload measurements, not iPhone power, GPU elapsed time, battery or temperature measurements. Test wrappers add JS overhead; callback CPU totals are comparative instrumented measurements.

| Idle world measure                     |      Baseline |    Candidate |
| -------------------------------------- | ------------: | -----------: |
| Main world draws/s                     |          60.0 |         30.0 |
| Main + offscreen draw calls/s          |        21,438 |        3,118 |
| Main + offscreen triangles/s           | 141.8 million | 35.4 million |
| RAF callback CPU ms/s                  |         160.3 |        116.2 |
| Steady opaque 2048 / Cruce world draws |          60/s |            0 |
| Candidate simulation update rate       |             — |   about 60/s |
| Candidate drawing buffer               |             — |      353×766 |

The idle world used about **85% fewer draw calls and 75% fewer triangles/s**. Both covered 20-second game-board intervals recorded zero main/offscreen draws, triangles, RAF callbacks and simulation updates after settling. Backend transport and DOM board actions continued. The world resumed around 30 draws/s and 60 updates/s. [Raw comparison](captures/mobile-input-performance/work-comparison.json).

The input phases are not identical camera trajectories: the baseline used a canvas drag, while the new right stick turns continuously while held. Their CPU values should not be used as an identical-motion performance comparison.

## Controls and authority

Actual Chromium pointer traces identify which pad received each down/up/cancel, including second/non-primary contacts. Six targeted replay cycles used both contact arrival orders and compared the module's actual axes: the ended pad becomes zero, the other pad's exact held vector stays unchanged, and final cancellation clears both. The traces show pad contacts staying on the move/look pads rather than entering canvas gestures. Independent source tests also cover third-contact rejection, capture loss, blur/hiding and cancellation. The earlier 24-cycle measurement is retained locally; its old release assertion attributed the ended contact incorrectly, as documented in [driver notes](captures/mobile-input-performance/driver-and-platform-limits.txt). [Trace-correlated proof](captures/mobile-input-performance/pointer-ownership.json).

Pure camera tests assert exact fixed radius/target and equal angle at 30/60/120 updates. Actual-game camera radius inferred from adjacent body/camera telemetry stayed 8.92–9.14m around the initial 9.03m while moving/turning; this is not an exact same-step camera-target probe. Mobile canvas rotate, zoom and pan are disabled; the right pad is the only touch look source.

A second local player saw the correct station-0 standing position `[-10.151, 0.845, 74.649]` through a 4.5-second opaque pause. The player remained online, cabinet leave released its claim, and reopening restored the same personal board. Run remained a toggle. Desktop had no mobile pads/driver and WASD continued to move. Scooter drive and park worked. Visible 2048 arrows were absent and swiping continued to work while 3D was stopped. [Functional results](captures/mobile-input-performance/functional-results.json).

## Controller timing

Separate actual-Game runs used synthetic RAF callback schedules of 30, 60 and 120/s; these are not claims of changing a physical display's refresh rate. The mobile driver retained fixed 60 Hz controller/Rapier updates:

| Synthetic callbacks/s | One-second walk displacement | Sampled jump apex Y | Timestamped steady scooter speed |
| --------------------- | ---------------------------: | ------------------: | -------------------------------: |
| 30                    |                      2.3697m |              8.027m |                         9.757m/s |
| 60                    |                      2.3681m |              8.009m |                         9.758m/s |
| 120                   |                      2.3681m |              8.020m |                         9.705m/s |

Every jump included a real held-key impulse, Jump_Start and vertical motion. Apex differences include 90ms telemetry sampling phase. Coarse one-second scooter snapshots initially varied with the motion-publication sampling phase; the timestamped steady series showed under 0.6% spread. [Walk/jump samples](captures/mobile-input-performance/walking-jump-timing.json), [coarse snapshots](captures/mobile-input-performance/vehicle-coarse-snapshots.json), [timestamped vehicle series](captures/mobile-input-performance/vehicle-timestamped-series.json).

The actual Canvas lifecycle regression separately forced ten parent React updates/s and orientation/tablet changes. It verified persistent buffers 353×766, 759×351 and 692×519, stopped state staying stopped across parent updates, and bounded resume. [Lifecycle results](captures/mobile-input-performance/frame-lifecycle.json).

## Engine and physical-device limits

Playwright's **WebKit 26.5** ran the actual game and trusted single mouse-pointer drags on the mobile move/look pads, with zero page errors, correct release and the bounded frame driver. This is a desktop WebKit build with mobile emulation, not native iOS or a native multitouch test. [WebKit evidence](captures/mobile-input-performance/webkit-results.json).

Native iOS Simulator was attempted. Its Computer Use accessibility and screenshot observations both timed out (`-10005 timeoutReached`), so independent native two-finger gestures and a native Home Screen flow are **unrun**, not passed. The own created simulator was never booted and was deleted. The Simulator app initially auto-booted its last-used iPhone 16 Pro; that device was immediately restored to its recorded Shutdown state before workload measurement. All devices were shut down at hard return. The actual owner's connected-device listing was unavailable. Physical iPhone feel, temperature and battery behavior still require the owner's retest after publication.

## Checks and preview preservation

533 frontend tests, frontend TypeScript, normal production build and isolated QA build passed. GitHub exact-head checks passed. No backend, origin, package or service-worker change was introduced. The old DPR-buggy candidate `c9edb41` was withdrawn before any shared-preview copy; its actual-Canvas failure led to the controlled-DPR regression fix.

Both baseline and candidate used bounded coordinated slots, one existing 4173 listener and no extra server. All owned browser contexts were closed, viewport restored, and only the six SHA-checked additions removed. Full original path/size/SHA manifests were restored: baseline 316 files; candidate 329 files, including the local lighting-editor index. No production state was used for these tests.

Selected visuals: [portrait move/look controls](captures/mobile-input-performance/move-look-portrait.png), [landscape controls](captures/mobile-input-performance/move-look-landscape.png). No further styling changes were made during the frozen candidate window.

The workload and contact driver is reproducible with `node scripts/check-mobile-performance.mjs candidate` (or `baseline` on the original baseline artifact), after the release owner publishes the isolated QA entry in a coordinated slot. It starts no server and refuses the normal game page. Use `PLAYWRIGHT_MODULE` and `CHROME_EXECUTABLE` when those test tools are supplied externally.
