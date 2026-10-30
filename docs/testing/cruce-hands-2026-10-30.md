# Cruce hands and surface contacts · 30 October 2026

Status: feature branch pushed as draft work. Automated checks pass; final actual Game contact/reconnect review is pending the coordinated single-preview QA slot. Do not treat the internal close-up fixture as release acceptance.

The old pose forced fixed world wrist rotations and applied a two-handed gun grip. The corrected pose aligns wrists with forearms, uses authored source A_TPose fingers, a shallow card pinch and a relaxed free hand. Per-piece forearm pronation avoids twisting the wrist; the fan is aligned with the palm plane. The playing card stays face-up and the free hand lifts before its fingers close.

`bake-cruce-hands.mjs` records target-specific finger poses and thumb contact. `measure-cruce-contacts.mjs` records actual deformed under-hip and distal finger-pad support regions in `docs/art-direction/cruce/character-contact-probes.json`, tied to the retained mesh hash. Feet/global minima/thumbs are excluded from seat/table support calibration. The actual holding thumb skin is checked against card stock too.

Actual timber surfaces are bench0.467m and table frame0.817m, separate from bolt maxima/felt. Under-hip reference is0.4667m, giving settled rendered root ground+0.0003m. Shared reconnect/QA poses use this root; local Player uses the same contact height through its full capsule/visual lift stack. A pose-bound calibration survives seat authority clearing during stand-up; other benches retain default0.45m. Remotes receive the corrected rendered root and apply no second seat lift.

Measured rest support gaps: left/right under-hip0.06/0.54mm; free index/middle/ring pads -0.06/1.9/2.3mm. Tests exercise actual skinned patches at all four seats and throughout the play motion, along with wrist alignment, finger extension, private-card projection, lifecycle/idle resources and unchanged other-bench defaults.

Current checks:329 frontend tests,116 protocol/server tests, both TypeScript checks and the world-QA production build pass. Root normal preview remains the previously accepted fullscreen/Wood build until final Game review/publication is coordinated. No extra server was started.
