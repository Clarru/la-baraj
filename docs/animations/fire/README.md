# Reference-led faceted campfire

The user's supplied screenshot is the visual target. [Zoomed detail](reference/fire-detail.png) shows hard angular orange/gold tongues around a pale-yellow core, diamond embers and six radial logs leaning into the center. The prior downloaded and ImageGen-painted flame textures were rejected. No painted texture is used by the current renderer.

Nine shallow faceted flame meshes recreate that layered silhouette. Each has four colored facets around a ridge, a pinned base, and small continuous height/width/lean changes. The individual tongues turn toward the camera, avoiding edge-on paper artifacts while their world-space positions preserve depth inside the pit. Eight instanced octahedral embers rise, grow and shrink; the radial seven-sided logs remain visible when extinguished. A bounded warm point light lights the rocks and logs.

Flames, embers and point light stay mounted across toggles, using opacity and intensity to fade on/off. The off state retains the light count and shader configuration. Reduced motion freezes the tongues, removes light flicker and hides moving embers. The existing authored character gesture, authoritative shared ignition, remote poses, seat claiming and scoot reservations are unchanged.

The only activity-state change is a tested constant-speed fire approach; seated scoots retain easing. The settlement integration changes only the FireCircle's old pair of horizontal logs to CampfireLogs, leaving cabin geometry and multiplayer integration intact.

The reference is user supplied and included for design provenance, not as a runtime texture. Shader/geometry code and logs are reconstructed locally. Final visual evidence and the exact served commit are recorded after the coordinated localhost preview check.
