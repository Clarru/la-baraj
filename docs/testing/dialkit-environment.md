# Local lighting and weather editor

Dialkit 2.1.0 and Motion 14.9.0 provide a browser-local environment editor. It is lazy loaded only on `localhost` and `127.0.0.1`. The normal world retains its Romanian clock, shared weather and existing renderer defaults until preview edits are explicitly enabled. No environment value is sent to the multiplayer room.

Open **Lighting** at the top right. Choose a time button to preview dawn, morning, noon, golden hour, dusk or midnight. For arbitrary times, enable edits, turn off **Live time**, then adjust **Hour**. Choose a weather look and press **Apply weather look**. Clear, partly cloudy, overcast, mist, rain light, storm light and snow light are lighting/atmosphere recipes; precipitation particles, wet surfaces, snow accumulation and lightning flashes are outside this editor.

The folders control sunlight, hemisphere fill, ambient fill, exposure, shadows, manual sun azimuth/elevation, ground bounce, fog distances, cloud size/opacity, two-axis wind, sky/horizon/fog/land/sun/fill/water colors, wave speed/distortion/size, and an optional uploaded reference image with opacity and notes. **Custom colors** enables the palette; **Sample this time’s colors** seeds it from the authored time-of-day palette. Dialkit colors are normalized from CSS color spaces to sRGB for Three.js. Light colors use RGB; alpha has no physical meaning for those lights.

**Day timeline** opens Dialkit’s own dock. A 30-second clip previews a full day; scrub or play it, move/resize the clip, and edit its easing or spring curve. Time presets turn the timeline off. Turning the dock off resumes the clock settings. The timeline does not advance the server clock or affect other browsers.

Use Dialkit **Save version** to retain and compare recipes; it supports WebGL thumbnails, renaming, deleting, and the version grid. Values and versions persist under `dialkit:la-baraj-environment-v1`, and timeline edits under its own stable ID. **Copy** is Dialkit’s native configuration copy; **Export settings as JSON** downloads a standalone recipe. Reference uploads stay in the browser. Browser storage limits still apply, particularly for images and version thumbnails.

**Return to live** bypasses all edits without deleting the recipe. **Reset all controls** restores defaults, clears the selected version and returns to live conditions. Closing the panel retains the current lighting recipe; the amber marker on the Lighting button indicates enabled edits. Game movement and actions pause while interacting with controls, including the timeline and library popovers.

## Validation

- Node 24, TypeScript and production Vite build.
- Full Vitest suite: 88 files / 526 tests, including five environment override regression tests.
- Regression coverage: opt-in behavior, cache invalidation, restoration, timeline clock precedence, shared palette, manual sun direction and crossed fog slider bounds.
- Browser acceptance uses the single coordinated `http://127.0.0.1:4173/` listener. No per-worktree server or backend is needed.

## Sources

- https://www.dialkit.dev/
- https://github.com/joshpuckett/dialkit/blob/main/docs/reference.md
- https://github.com/joshpuckett/dialkit/blob/main/docs/timeline.md

The controller extends the existing game HUD using Barlow and a compact dark editing surface so it stays legible over variable daylight. Dialkit retains its native controls, version gallery and timeline. Existing design-system files are preserved; the pre-existing DESIGN.md / design.json drift is outside this change.
