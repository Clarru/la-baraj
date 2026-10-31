# Local lighting and weather editor

Dialkit 2.1.0 and Motion 14.9.0 provide a browser-local environment editor. The
editor is lazy loaded only on `localhost` and `127.0.0.1`; it is not part of the
production or multiplayer-room surface. The normal world keeps its Romanian
clock, shared weather, and existing renderer defaults until preview edits are
explicitly enabled. No environment value is sent to the multiplayer room, and
this feature has no backend or production writes.

## Using the editor

Open **Lighting** at the top right. Choose a time button to preview dawn,
morning, noon, golden hour, dusk, or midnight. For arbitrary times, enable
edits, turn off **Live time**, and adjust **Hour**. Choose a weather look and
press **Apply weather look**. Clear, partly cloudy, overcast, mist, rain light,
storm light, and snow light are lighting/atmosphere recipes; precipitation
particles, wet surfaces, snow accumulation, and lightning flashes are outside
this editor.

The folders control sunlight, hemisphere fill, ambient fill, exposure, shadows,
manual sun azimuth/elevation, ground bounce, fog distances, cloud size/opacity,
two-axis wind, sky/horizon/fog/land/sun/fill/water colors, wave speed/distortion/
size, and an optional uploaded reference image with opacity and notes. **Custom
colors** enables the palette; **Sample this time’s colors** seeds it from the
authored time-of-day palette. Dialkit colors are normalized from CSS color
spaces to sRGB for Three.js. Light colors use RGB; alpha has no physical
meaning for those lights.

**Day timeline** opens Dialkit’s own dock. A 30-second clip previews a full day;
scrub or play it, move/resize the clip, and edit its easing or spring curve.
Time presets turn the timeline off. Turning the dock off resumes the clock
settings. The timeline does not advance the server clock or affect other
browsers.

Use Dialkit **Save version** to retain and compare recipes; it supports WebGL
thumbnails, renaming, deleting, and the version grid. **Copy** is Dialkit’s
native configuration copy; **Export settings as JSON** downloads a standalone
recipe. Reference uploads stay in the browser. Browser storage limits still
apply, particularly for images and version thumbnails.

**Return to live** bypasses all edits without deleting the recipe. **Reset all
controls** restores defaults, clears the selected version, and returns to live
conditions. Closing the panel retains the current lighting recipe; the amber
marker on the Lighting button indicates enabled edits. Game movement and
actions pause while interacting with controls, including the timeline and
library popovers.

## Architecture and persistence

- The editor is an opt-in, client-only layer over the existing game HUD. It is
  loaded lazily for local development/QA hosts, and the default game path is
  unchanged while edits are off.
- The renderer consumes the active local recipe; the multiplayer room and
  server clock do not receive environment values. The day timeline is also
  local and does not advance the shared clock.
- Dialkit versions and environment values persist under
  `dialkit:la-baraj-environment-v1`. Timeline edits use the stable ID `la-baraj-day-timeline-v1`. Versions, selected recipes, and timeline timing edits survive a page reload in the same browser profile.
- **Save version** creates a browser-local recipe snapshot and thumbnail;
  switching versions restores that recipe. Edits update the selected version automatically, so save a new version before changing a recipe you want to keep. **Copy** stays in Dialkit’s native
  configuration format, while **Export settings as JSON** creates a standalone
  download. The exported file is not a server backup.
- Reference images and notes remain browser-local. Treat uploads and WebGL
  thumbnails as storage-budget consumers and remove test data through the UI
  when finished.
- **Return to live** changes the active rendering mode without deleting stored
  recipes. **Reset all controls** restores defaults, clears the selected
  version, and returns to live; use it when a test profile must be left clean.

## Acceptance evidence

The following evidence was completed against the same coordinated
`http://127.0.0.1:4173/` listener on frozen baseline `3ffa`:

- Initial state opened with edits **off** and the live world visible. Noon,
  Midnight, and Golden Hour presets held after selection and were visibly
  different from one another.
- Version persistence worked: V2 was saved from Golden Hour and V1 from Noon;
  switching back to V2 restored hour `18`, and the versions remained after a
  page reload.
- Weather/atmosphere recipes were exercised for mist, storm, cloud, fog, and
  sun variations. Typed exposure `0.30` visibly darkened the scene. The XY
  control accepted `ArrowRight` (`-137` → `-136`).
- Color acceptance worked for hex `#ffaa44` and through the OKLCH picker. The
  custom-color flow remained in Dialkit’s native controls.
- Typing actual `WASD/E/R/H` keys into notes preserved the text, kept the game in walk view, and left interior mode `false`. Closing the editor and then pressing `H` resumed the game shortcut and opened the home view.
- The native Day Timeline played, paused, and scrubbed its ruler to `15.07`.
  **Return to live** and **Reset all controls** both completed their expected
  transitions.
- **Export settings as JSON** downloaded a valid schema-1 JSON file. The
  reference-upload control was inspected, but an upload itself was not
  exercised; this is intentionally not claimed as upload acceptance.
- The desktop viewport `1280×720` and narrow viewport `391×844` both fit the
  editor. The browser run reported no console errors; the only messages were
  existing Three/Rapier deprecation warnings.
- QA reset test data through the UI: V2 was deleted, the owned QA tab was
  closed, and the viewport was reset. The shared baseline of 316 files—names,
  SHA values, and sizes—was fully restored after only the eight authorized QA
  file deletions.
- Browser acceptance used the single coordinated listener; no per-worktree
  server or backend test service was needed.

Valid visual evidence is stored at `.impeccable/review/desktop.jpg` and
`.impeccable/review/mobile.jpg`. Earlier captures with browser padding were
excluded from review and removed from this task’s local evidence.
The finish review found no other material functional, accessibility, or
viewport issues.

## Validation status and follow-up

At the QA integration point, Node `24.22.2`, the full Vitest suite (88 files /
526 tests), and the production build passed after merging font main
`8388736` into `a53a828`.
The existing regression coverage includes opt-in behavior, cache invalidation,
restoration, timeline clock precedence, shared palette, manual sun direction,
and crossed fog-slider bounds.

The only finish-review finding, a P2 for referenced but unloaded Barlow, is
resolved. The editor now imports Latin weights 400, 500, and 600 lazily. The
final Node `24.22.2` production build passed. Replacement desktop and narrow
captures show readable Barlow framing and retain Dialkit’s native typography.
Runtime computed framing is `Barlow, sans-serif`; the font set reports loaded,
all three weight checks pass, and the supported browser asset inventory records
all three generated WOFF2 resources. The browser inspection surface does not
expose font-set iteration, so resource observations corroborate the checks.
There were no console errors. The narrow reviewer verdict is **Ship**, with
the sole P2 resolved and no further source change or recapture required.

The integration owner published the font-synced candidate `b0214d5` at the normal
local URL while keeping main and production on `8388736`. The font confirmation
used those exact normal chunks through a temporary isolated alias. The owned
QA tab was closed, its viewport reset, and only that authorized alias was
removed after hash verification; all 329 normal files were verified unchanged.
This records the publication state on October 31, 2026, rather than reserving
ownership of future preview updates.

This documentation update records the current localhost-first hold. Draft PR
62 is not authorization to merge, deploy, or write production/backend state.

## Design-system boundary

The controller extends the existing game HUD with a compact dark Barlow outer
frame while preserving Dialkit’s native controls, version gallery, and
timeline. Existing design-system files are preserved. The pre-existing
`DESIGN.md` and `.impeccable/design.json` drift was observed and is reported,
not repaired, because this is an ordinary extension rather than a new visual
world.

## Sources

- https://www.dialkit.dev/
- https://github.com/joshpuckett/dialkit/blob/main/docs/reference.md
- https://github.com/joshpuckett/dialkit/blob/main/docs/timeline.md
