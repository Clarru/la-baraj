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

A single fixed app frame follows the unzoomed VisualViewport dimensions/offsets, including resize, rotation, pageshow/focus and keyboard lifecycle. Intentional pinch zoom is left to the browser. The canvas fills the available frame; safe-area padding applies to controls. The candidate preserves production's `black-translucent` meta value after an unsuccessful intermediate `default` trial. This does **not** establish an edge-to-edge fix: current native observations rejected both settings on cold landscape launch. The archived [Apple meta documentation](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html) describes historical behavior; current WebKit guidance below qualifies it.

### Native observations and current platform evidence (October 31, 2026)

The owned iPhone 15 Pro simulator runs iOS 26.5 build 23F77. Available local runtimes stop at 26.5; there is no iOS 27 runtime. The owner's physical phone uses an unspecified “latest” version. Simulator behavior cannot establish the owner's exact OS result or phone temperature.

| Installed launch                                                                                                                                         | Observed geometry                                                                                                                                             | Result                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Earlier `default` fixture, portrait then landscape                                                                                                       | inner/VisualViewport/frame 852×393                                                                                                                            | Warm rotation filled the available landscape view.                                                                                                                                               |
| `default`, cold landscape relaunch                                                                                                                       | inner/VisualViewport/frame 852×334                                                                                                                            | A 59 CSS pixel area remained above the page.                                                                                                                                                     |
| Fresh installation with production display/fullscreen, override and landscape manifest settings; `black-translucent`; cold landscape launch and relaunch | inner, VisualViewport, documentElement client size, html/root/frame all 852×334; `100dvh` 334px; screen 393×852; safe insets top/right/bottom/left 0/59/20/59 | The actual Game/canvas also measured 852×334, leaving a 59px bottom strip. Navigator standalone was true and display-mode fullscreen matched. No independent frame-vs-layout mismatch was found. |

These measurements are consistent with a platform reservation; they do not prove the same root cause as a particular WebKit report. No negative offsets, invented physical-screen height, forced scroll or input mutation was used. Replacing the frame with `100dvh` would reproduce the measured 334px height.

Primary-source review:

- [WebKit 313800](https://bugs.webkit.org/show_bug.cgi?id=313800), **NEW**: reports a status-bar-sized bottom area outside the exposed web viewport. Reporters measured the same difference across screen and inner/VisualViewport sizes, including install-time differences. This is a closely matching failure class, not an accepted repair.
- [WebKit 301994](https://bugs.webkit.org/show_bug.cgi?id=301994), **REOPENED**: reports on iOS 26.5.2 include matching inner/100dvh/client/VisualViewport dimensions smaller than the physical display. An engineer confirmed an iOS 27 beta case; the issue remained reopened after an October 21 comment about canvas apps.
- [WebKit 317153](https://bugs.webkit.org/show_bug.cgi?id=317153), **RESOLVED FIXED** October 9: an engineer states that `black-translucent` is deprecated and recommends removing it. Later reports distinguish fresh installation from retained icons; a July beta 4 report stopped reproducing. Combined with the open reports, this is version/install-sensitive evidence, not a universal setting guarantee.
- [Safari 26.1 release notes](https://webkit.org/blog/17541/webkit-features-for-safari-26-1/) list a fixed viewport-sized-container bottom gap (158055568). That release note does not establish that our later cold-launch case is fixed.
- [WebKit viewport-unit definitions](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/) distinguish the largest potential viewport (`lvh`) from the current dynamic viewport (`dvh`). A larger unit alone does not establish that the OS will paint or accept input in the missing area.

The native pass stopped at this display failure. Warm rotation/background/foreground and actual Game keyboard restoration remain unrun for the latest candidate. Supported CUA drags in the earlier installed controller fixture produced trusted start/end events but no move events, also failing to swipe the system Home Screen: native steering and native multi-touch are **unverified**, not passed. Trusted Chromium tests do exercise those controller streams. Physical touch feel and heat remain unverified. PR 65 stays draft pending release-owner review of these limitations.

Mobile outdoor camera offsets pull back about 25% horizontally; cabin interiors, Cruce and active arcade focus retain their framing. Arcade exit returns to at least an 11m mobile follow distance. Desktop offsets remain unchanged.

To address blurry 3D, the controlled mobile cap becomes DPR 1.25 / 520,000 drawing pixels instead of DPR 0.9 / 360,000. This is an explicit sharpness/work tradeoff to measure, not a thermal claim. The 30-draw/60-simulation schedule, disabled mobile mirror/shadow passes and zero covered-world work remain.

## Acceptance plan

- Source lifecycle tests: normal short taps/static reuse without rebuild; missing-end zero and usable next gesture; held sibling unchanged; fast re-touch before deferred recovery; stale callbacks/native ends; capture-independent off-zone end; blur/pagehide/rotation and omitted focus return; lazy init/StrictMode/remount and one live manager/zone.
- Actual browser and native Safari simulator: repeated taps/drags, two contacts in either order, off-zone movement/end, crossing fingers, native cancellation, input after rotation and app background/foreground. The local QA page offers an input readout and a test-only dropped pointer-end fault injector; it cannot join production.
- Visual acceptance: portrait gate, landscape full-frame bounds, safe-area margins, bottom strip, top edge/status bar, keyboard close, wider outdoor view and unchanged activity/interior cameras. Measure actual buffers and work at the sharper cap.
- Preserve multiplayer cabinet/seat claims, standing alignment, saved boards, timers, desktop control and the separate local lighting editor.

A physical iPhone retest remains the final input/thermal acceptance; simulator and desktop WebKit results will be labelled accurately. One shared 4173 listener only; the release owner grants and verifies additive QA publication.
