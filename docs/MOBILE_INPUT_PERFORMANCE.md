# Mobile input and rendering follow-up

The initial mobile release was rejected after the owner tested it on an **iPhone 15 Pro, Safari installed on the Home Screen**: movement combined with looking glitched and the phone warmed up. The previous Chromium touch checks did not establish physical-device usability or thermal behavior. This follow-up treats that report as a failure, not as a passed mobile acceptance.

## Findings and design

The first stick translated its axes into W/A/S/D booleans, reducing direction to eight choices. Camera look was still delegated to canvas OrbitControls gestures. The replacement gives each thumb a fixed pad and a separately captured pointer ID; ignores additional contacts on an occupied pad; and clears only that pad when its contact is released/cancelled/lost. Stick bounds are cached at gesture start. Continuous movement direction enters Ecctrl's joystick input. The right pad supplies bounded, time-based yaw/pitch without panning or zooming. Desktop keyboard/mouse and the Run toggle remain.

The old scene kept drawing at display cadence while the opaque mobile 2048 and Cruce interfaces covered it. It also rendered shadow maps and a full mirrored world for the water. A frozen-main-838 baseline on desktop Chromium/Metal, emulating 393×852 / DPR3 / iPhone UA / standalone, measured:

| State                    | Main frames/s | Main draws/s | Offscreen draws/s | Main triangles/s | Offscreen triangles/s |
| ------------------------ | ------------: | -----------: | ----------------: | ---------------: | --------------------: |
| Idle world (30s)         |          60.0 |        6,181 |            15,258 |            68.6M |                 73.2M |
| 2048 opaque board (20s)  |          60.0 |        2,942 |            15,705 |            46.8M |                 75.2M |
| Cruce opaque lobby (20s) |          60.0 |        5,461 |            17,289 |            52.9M |                 79.3M |

These are instrumented work counts on a Mac, not iPhone GPU timings, watts, temperatures or battery-life measurements. Test-only wrappers count main/offscreen WebGL draws/triangles, clears and RAF callback CPU time. The same instrumentation is retained for the after measurement. The initial driver sent a duplicate TouchEnd without an active contact; the driver was corrected and a complete baseline rerun succeeded with 24 contact-order/release/cancel cycles, no page errors and no network WebSockets. The frozen baseline and results are preserved under `.impeccable/review/mobile-input-performance/`.

## Mobile rendering budget

- Maintain **fixed 60 Hz simulation steps** so Ecctrl's per-frame impulses and Rapier's 1/60 timestep keep their existing contract. Merely dropping all useFrame work to 30 Hz would reduce controller impulses and was deliberately avoided.
- Draw the mobile world at **30 Hz**, independently of a 60/90/120/144 Hz display. Bound catch-up after stalls. Stop the frame driver when hidden, and reset its accumulator on resume.
- After 1.1 seconds of seat/cabinet settling and pose publication, suspend the hidden 3D scene behind opaque mobile Cruce/Planes/2048 panels. Room transport and DOM game hooks/timers are outside that frame driver and continue. Resuming starts with one normal fixed step, not the elapsed background gap.
- Cap the mobile drawing buffer to DPR 0.9 and 360,000 pixels. Disable mobile multisample antialiasing and shadow maps. `low-power` is a browser preference hint, not a power/thermal guarantee.
- Keep water waves and current sun/water/weather colors, but use a cached 32×32 sky-gradient reflection on mobile rather than rendering the world into a mirror target. The gradient follows current sky/horizon colors, including night and local lighting overrides. Desktop retains its 20 Hz planar reflection and shadow defaults.

Mobile 2048 now uses swipes only in its visible interface. Its direction buttons and arrow hints are removed; desktop keyboard and assistive controls are retained.

## Research and implementation grounding

- [Ecctrl movement API and source](https://github.com/pmndrs/ecctrl) supports a continuous joystick vector; its controller normalizes direction and applies impulses per useFrame using `60 * world.timestep`. This integration changes direction precision without claiming proportional analog speed.
- [React Three Fiber manual rendering](https://r3f.docs.pmnd.rs/api/hooks) supports `frameloop="never"`/`advance`; the installed source uses seconds for manual elapsed time. The mobile driver advances only its own root and renders after the fixed updates.
- [Three.js Water source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Water.js) confirms the reflected scene render; [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) recommends reducing back-buffer cost and avoiding needless work.
- [Pointer Events specification](https://www.w3.org/TR/pointerevents/) defines per-pointer capture and cancellation. [Phaser multi-touch input](https://phaser.io/oss/docs/phaser/concepts/input) similarly models independent pointers rather than one shared active contact.
- [WebKit frame-rate discussion](https://webkit.github.io/explainers/animation-frame-rate/) explains power tradeoffs at high refresh rates. No assumption is made about which refresh rate the owner's Safari actually used.
- [Apple Simulator interaction guidance](https://developer.apple.com/documentation/xcode/interacting-with-your-app-in-the-ios-or-ipados-simulator) and [Playwright browser limitations](https://playwright.dev/docs/browsers) distinguish an iOS simulator, Playwright's WebKit build and a physical iPhone. None can measure heat on the owner's phone.

## Verification status

Frontend TypeScript and 533 tests pass, including independent two-contact arrival/release/cancel/third-finger handling; equal look rotation at 30/60/120 update rates with fixed orbit radius; 60 simulation / 30 draw budgets at 60/90/120/144 display rates; bounded catch-up and resume; pixel budget; and night/local-override reflection colors. Normal and isolated QA builds pass.

An actual-Canvas lifecycle probe caught and corrected a further defect before shared QA: an imperative setDpr was overwritten by the Canvas prop during parent React updates. Game now owns the reported pixel ratio as state and feeds it back to Canvas. The reproducible `scripts/check-mobile-frame.mjs` probe rerenders the parent ten times per second: 393×852 stays at 353×766 drawing pixels, 844×390 at 759×351, and 1366×1024 at 692×519 (below 360k). Covered state stays stopped despite parent updates and resumes without replaying hidden time. See [lifecycle results](testing/captures/mobile-input-performance/frame-lifecycle.json).

Actual-game before/after workload comparison, bystander claim/alignment during opaque suspension, timing invariance, Safari/WebKit/simulator checks and physical iPhone follow-up are still pending acceptance. No claim that phone heat is fixed is made by these source checks.

The release owner coordinates all writes to the single 4173 preview. The baseline slot returned early with exactly six additions removed and every one of the 316 original path/size/SHA values restored. No extra game or backend listener was started.
