# Established controller and landscape follow-up

The owner’s physical iPhone 15 Pro retest rejected the custom pads: movement begins but steering becomes stuck/unresponsive. They also requested landscape, a slightly wider camera view, less bottom space and a clearer top edge. Physical acceptance remains open.

## Controller selection

Safari exposes browser input APIs, not Apple's native-app `GCVirtualController` UI. A true system-native overlay would require a native iOS app. This web game adopts **NippleJS 1.0.4**, pinned exactly (MIT, no runtime dependencies), instead of maintaining its own button/pointer-capture joystick.

Primary research:

- [Apple GCVirtualController](https://developer.apple.com/documentation/gamecontroller/gcvirtualcontroller): the native-app controller framework.
- [NippleJS options](https://yoannmoi.net/nipplejs/options/) and [v1.0.4 release](https://github.com/yoannmoinet/nipplejs/releases/tag/v1.0.4): separate managers, static controls, threshold, transition and dynamic-page positioning. Recent releases fix static-touch reuse, manager DOM containment and sibling-pointer cleanup. The installed 1.0.4 TypeScript source was inspected; the package adds about 6.1kB gzip as a lazy chunk.
- [Historical iOS stuck-joystick report](https://github.com/yoannmoinet/nipplejs/issues/31): missing release events and fast reuse are relevant failure modes. That older issue is evidence of a class of problem, not a diagnosis of the owner's phone.
- The installed Ecctrl joystick was inspected too; it uses element pointer capture, so simply swapping to it would retain the disputed mechanism.

NippleJS owns the UI, geometry, document-level movement and end/cancel handling. Each pad gets one manager. There are no custom pad buttons or `setPointerCapture` calls. Native Touch Events identify the original zone owner by `Touch.identifier`/target, independent of where the finger later moves. A matching native end clears only that external axis. After the normal library lifecycle has had time to end, a proven desynchronized idle zone is rearmed through public `destroy/create`; internal maps and node_modules are never changed. An ended zone cannot rebuild or zero its held sibling. Generations guard old imports, callbacks and deferred recovery. Page hide/blur suspend; visible/focus or a new input can rebuild. Safari callout/context-menu and native scrolling are suppressed only in the joystick zones.

The library is preloaded alongside the world and pads stay hidden until bound, avoiding an inert first-touch target. StrictMode, remount and failed-load recovery are handled. Run stays a toggle and 2048 keeps its swipe-only visible interface.

## Landscape, viewport and camera

The mobile game requires a landscape layout. Portrait shows a rotate prompt and pauses/resets input while retaining an already mounted Game/connection. The manifest requests landscape; orientation locking is attempted only through a guarded supported browser API. Unsupported or rejected locks do not falsely dismiss the prompt. [MDN orientation locking](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock) and [WebKit support discussion](https://bugs.webkit.org/show_bug.cgi?id=257695) explain why physical rotation remains necessary on some Safari installations.

A single fixed app frame follows the unzoomed VisualViewport dimensions/offsets, including resize, rotation, pageshow/focus and keyboard lifecycle. Intentional pinch zoom is left to the browser. The canvas fills that frame; safe-area padding applies to controls, not a second empty strip around the scene. The installed-app status-bar meta remains `black-translucent` together with `viewport-fit=cover`: Apple documents that this lets the scene draw through the full screen. Interactive HUD elements retain their existing `env(safe-area-inset-*)` margins; the canvas itself receives no safe-area padding. A native iPhone 15 Pro / iOS 26.5 simulator pass rejected `default`: a cold landscape launch reserved 59 CSS pixels outside the 852×334 viewport, whereas portrait→landscape returned 852×393. This is an OS-reserved area, so no negative offsets or invented screen heights are used to cover it. Fresh installation and cold launch are required to validate metadata changes, alongside warm rotation and keyboard close. [Apple's meta-tag documentation](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html), [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) and [WebKit viewport discussion](https://webkit.org/blog/18486/webkit-features-for-safari-27-1/) ground this choice. It still requires installed-Safari visual acceptance.

Mobile outdoor camera offsets pull back about 25% horizontally; cabin interiors, Cruce and active arcade focus retain their framing. Arcade exit returns to at least an 11m mobile follow distance. Desktop offsets remain unchanged.

To address blurry 3D, the controlled mobile cap becomes DPR 1.25 / 520,000 drawing pixels instead of DPR 0.9 / 360,000. This is an explicit sharpness/work tradeoff to measure, not a thermal claim. The 30-draw/60-simulation schedule, disabled mobile mirror/shadow passes and zero covered-world work remain.

## Acceptance plan

- Source lifecycle tests: normal short taps/static reuse without rebuild; missing-end zero and usable next gesture; held sibling unchanged; fast re-touch before deferred recovery; stale callbacks/native ends; capture-independent off-zone end; blur/pagehide/rotation and omitted focus return; lazy init/StrictMode/remount and one live manager/zone.
- Actual browser and native Safari simulator: repeated taps/drags, two contacts in either order, off-zone movement/end, crossing fingers, native cancellation, input after rotation and app background/foreground. The local QA page offers an input readout and a test-only dropped pointer-end fault injector; it cannot join production.
- Visual acceptance: portrait gate, landscape full-frame bounds, safe-area margins, bottom strip, top edge/status bar, keyboard close, wider outdoor view and unchanged activity/interior cameras. Measure actual buffers and work at the sharper cap.
- Preserve multiplayer cabinet/seat claims, standing alignment, saved boards, timers, desktop control and the separate local lighting editor.

A physical iPhone retest remains the final input/thermal acceptance; simulator and desktop WebKit results will be labelled accurately. One shared 4173 listener only; the release owner grants and verifies additive QA publication.
