# Reference-led faceted campfire

The user's supplied screenshot is the visual target. [Zoomed detail](reference/fire-detail.png) shows hard angular orange/gold tongues around a pale-yellow core, diamond embers and six radial logs leaning into the center. The prior downloaded and ImageGen-painted flame textures were rejected. No painted texture is used by the current renderer.

Nine shallow faceted flame meshes recreate that layered silhouette. Each has six colored facets around a ridge, a pinned base, and small continuous height/width/lean changes. The layered cluster turns toward the camera, keeping the pale core readable from every side while individual tongues sway and change height. Eight instanced octahedral embers rise, grow and shrink; the radial seven-sided logs remain visible when extinguished. A bounded warm point light lights the rocks and logs.

Flames, embers and point light stay mounted across toggles, using opacity and intensity to fade on/off. The off state retains the light count and shader configuration. Reduced motion freezes the tongues, removes light flicker and hides moving embers. The existing authored character gesture, authoritative shared ignition, remote poses, seat claiming and scoot reservations are unchanged.

The only activity-state change is a tested constant-speed fire approach; seated scoots retain easing. The settlement integration changes only the FireCircle's old pair of horizontal logs to CampfireLogs, leaving cabin geometry and multiplayer integration intact.

The reference is user supplied and included for design provenance, not as a runtime texture. Shader/geometry code and logs are reconstructed locally. See [the in-game result](reference-result.png) and [runtime evidence](reference-verification.json). The coordinated preview served commit356d2b7 (index-DbXUvspH.js) on the existing localhost:4173 listener; no extra server was started. This is an offline visual build, not a new multiplayer acceptance test.

The integrated suite passed98 tests across18 files, and the production build including TypeScript passed. Browser checks verified the geometry from multiple angles, the stand/approach/kneel/light gesture, and extinguished logs. The final off/on windows peaked at10.8/11.7ms with zero frames over33ms and stable64 programs/80 textures/322 geometries in that camera view. Those short local samples are not a general frame-rate guarantee. Read-only review caught invisible ember depth writes, which were disabled before the final build. No browser errors were recorded.
