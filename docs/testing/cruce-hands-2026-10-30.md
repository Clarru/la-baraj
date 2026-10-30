# Cruce hands and surface contacts · 30 October 2026

Status: actual Game contact, forced release/reclaim, ordinary stand confirmation and two-client reconnect passed. All release evidence is recorded below; no further visual polish is planned.

The old pose forced fixed world wrist rotations and applied a two-handed gun grip. The corrected pose aligns wrists with forearms, uses authored source A_TPose fingers, a shallow card pinch and a relaxed free hand. Per-piece forearm pronation avoids twisting the wrist; the fan is aligned with the palm plane. The playing card stays face-up and the free hand lifts before its fingers close.

`bake-cruce-hands.mjs` records target-specific finger poses and thumb contact. `measure-cruce-contacts.mjs` records actual deformed under-hip and distal finger-pad support regions in `apps/web/src/cruce-contact-probes.json`, tied to the retained mesh hash. Feet/global minima/thumbs are excluded from seat/table support calibration. The actual holding thumb skin is checked against card stock too.

Actual timber surfaces are bench0.467m and table frame0.817m, separate from bolt maxima/felt. Under-hip reference is0.4667m, giving settled rendered root ground+0.0003m. Shared reconnect/QA poses use this root; local Player uses the same contact height through its full capsule/visual lift stack. A pose-bound calibration survives seat authority clearing during stand-up; other benches retain default0.45m. Remotes receive the corrected rendered root and apply no second seat lift.

Measured rest support gaps: left/right under-hip0.06/0.54mm; free index/middle/ring pads -0.06/1.9/2.3mm. Tests exercise actual skinned patches at all four seats and throughout the play motion, along with wrist alignment, finger extension, private-card projection, lifecycle/idle resources and unchanged other-bench defaults.

Current checks:329 frontend tests,116 protocol/server tests, both TypeScript checks and the world-QA production build pass. Root normal preview remains the previously accepted fullscreen/Wood build until final Game review/publication is coordinated. No extra server was started.


Final actual Game evidence on internal contact candidate650ec49: all four local/remote under-hip patches remained0.0–0.5mm from the seat; resting finger pads ranged roughly-1.8..5.2mm with natural pose variation, and thumb/card contact was0.4mm. An accepted As play and peer plays lifted/returned the playing hands while hip contact stayed stable. Forced authority release showed the seat free and spectator controls; reclaim succeeded. With a second real client keeping the local SharedWorker alive, reload restored the seat automatically with rootY0.763389466 and hip gaps0/0.5mm. Single-last-tab reload starts a new ephemeral local world, so it was not used as reconnect evidence. Ordinary F stand confirmation passed; all test peers were released and both Game test tabs closed; browser error log empty.

Captures/records: `.impeccable/review/cruce-hands/contact-final-side.jpg`, `game-four-contact.jpg`, `game-contact-samples.json`, and `publication.json`. The full204-file normal preview baseline was restored byte-for-byte, including the temporarily updated old hand fixture; only unique QA additions remain. Exact QA backup is recorded in publication.json. Preview ownership returned to the release owner.

Deployment audit found that Vercel excludes docs/. The generated probe data was moved into apps/web/src so both TypeScript and QA builds can resolve it on Vercel; normal bundles remove the probe entirely through a direct compile-time flag. No gameplay/pose change accompanies that source-path/build fix.
