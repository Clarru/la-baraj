# Mobile play

La Baraj supports touch entry, world movement, nearby activities, Cruce and 2048. Mobile work lives on `codex/mobile-play`; the release owner integrates and deploys it. The one shared preview remains http://127.0.0.1:4173/.

## Controls and layout

- The fixed left thumb stick supplies camera-relative walking and swimming, and forward/reverse/steering for existing vehicles. Dragging beyond its radius clamps the input; a small dead zone prevents resting-thumb movement. Run toggles running/vehicle boost. Jump is a short held pulse sampled by the physics controller.
- Drag the world with another finger to orbit; pinch to zoom using the existing OrbitControls. Each control captures its own pointer, so movement and camera/action touches can coexist.
- Nearby actions use the same handlers and eligibility checks as keyboard input: sit/stand, doors, fishing, campfire and vehicles. Touch actions have their own channel; they do not dispatch fabricated browser keyboard events. Server seat/arcade claims and proximity checks remain authoritative.
- Releasing, cancelling or losing a pointer stops movement. Opening panels, changing activities, blurring/hiding the app, rotating the device or leaving fullscreen clears touch state. Fullscreen re-entry preserves the mounted game and its connection.
- Cabins, game entries and chat have tappable controls. Cruce and Planes seats can reopen their game or stand using touch controls. Cruce shows the table, horizontally scrollable hand, then secondary scores/settings on phones; landscape puts the hand beside the table. Card and bidding actions use the existing private view and revision checks.
- 2048 has a mobile board, swipe recognition, four explicit direction buttons, scores, records, new-game confirmation, win/continue, game-over and leave actions. It uses the same `useArcade2048` controller, saved game and server authority as the cabinet. Desktop retains the physical screen.
- Touch rendering uses DPR 1 to reduce pixel work on high-density screens. This is not a measured phone performance guarantee.

## Fullscreen and installation

Mobile entry asks the player to tap **Play in fullscreen** before loading the game. Browsers require user activation and may refuse the Fullscreen API. Unsupported or denied requests offer **Play in this browser** and installation instructions. Exiting supported fullscreen shows the entry screen again and blocks world controls until resumed. Installed standalone/fullscreen windows count as an immersive view.

`manifest.webmanifest` requests fullscreen with standalone fallback and supplies 192px, 512px, maskable and Apple touch icons. The icons reuse the existing La Baraj banner and lake vignette. The web manifest has a stable root ID/start URL, reflecting the one shared world.

When a browser provides `beforeinstallprompt`, the install button invokes that saved prompt from a tap, handles dismissal and consumes it once. iPhone/iPad instructions explain Safari → Share → Add to Home Screen → Open as Web App (if shown) → Add. Launching the installed icon opens the app view. There is no API to install silently or to prove that a user completed a manual Home Screen operation in another browser window.

No service worker, offline-world promise, storage migration, backend/origin change or paid service is introduced. Multiplayer, Cruce and 2048 need the network. Existing game assets retain their current caching behavior.

## Research behind the implementation

- [MDN: Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API) documents user activation, permission failures and fullscreen change events.
- [MDN: manifest display](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display) explains the fullscreen → standalone → minimal UI → browser fallback and why installed display mode differs from `document.fullscreenElement`.
- [web.dev: installation](https://web.dev/learn/pwa/installation) covers platform-specific manifest/install requirements and the optional native installation prompt.
- [Apple: turn a website into an app on iPhone](https://support.apple.com/en-lb/guide/iphone/iphea86e5236/27/ios/27) and [WebKit: Safari 26 Home Screen web apps](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) ground the manual Apple flow.
- [NippleJS](https://github.com/yoannmoinet/nipplejs) and [JoyStick](https://github.com/bobboteck/JoyStick) demonstrate fixed/dynamic joystick patterns, dead zones, directional values and return-to-center behavior. This game uses a small original controller and adds no joystick dependency or copied library code.
- [MDN: Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) grounds per-pointer capture, cancellation and `touch-action`; [Three.js OrbitControls](https://threejs.org/docs/#OrbitControls) supplies the existing one-finger rotation/two-finger zoom behavior.

## Verification

Run with Node 24:

```sh
npx tsc --noEmit
npm test
npm run build
node scripts/build-mobile-qa.mjs
```

The last command builds `.impeccable/review/mobile-world/build/__mobile-world-qa.html`. It is a localhost-only additive fixture with the actual Game, physics, LocalWorldRoom, diagnostic outputs and existing authored test positioning. It starts no server. Only the release owner publishes it to the shared 4173 preview. It cannot connect to production and is not imported by the normal build.

Automated checks cover device entry, stick dead zone/clamping, touch action cleanup, simultaneous movement and interaction, pointer cancellation/panel hiding, fullscreen success/exit/denial, native install prompting and swipes. Existing Cruce, 2048, movement and multiplayer suites remain required.

Physical iPhone Safari/Home Screen and Android Chrome/installed-app acceptance must distinguish real device results from emulated Chromium touch results. Browser emulation cannot verify an OS install sheet, iOS safe-area hardware or real phone GPU/thermal behavior.
