# Swimming in La Baraj

The lake's OSM shoreline is still the water boundary, but the invisible collision wall is gone. Players wade in the shallow edge, then float and swim on the surface; they resume walking as they approach a bank. The water depth is the game's existing procedural terrain, not surveyed lake bathymetry. Swimming is surface-only: there is no diving, oxygen or drowning mechanic.

The accepted character and its skeleton stay unchanged. `Swim_Forward` and `Swim_Idle` are extracted from `Swim_Fwd_Loop` and `Swim_Idle_Loop` in the project's existing `human_male.glb` source. They are from [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html), which identifies swimming clips and a CC0 license. Track extraction is recorded in `scripts/extract-activity-clips.mjs` and the runtime animation manifest. The two clips increase the existing shared animation JSON by about 54 KB gzipped in a local compression check; no new character model is loaded.

## Approach

Three.js's existing [Water](https://threejs.org/docs/pages/Water.html) is a flat, reflective animated shader, not a fluid simulator. Its existing normal-map animation and 20 Hz reflection budget stay in place. A shared, small ring mesh adds a surface wake per nearby swimmer. While the player moves, the shoreline test runs approximately every 100 ms or after 0.3 m of travel; it skips the 643-point polygon scan when the player stays still.

The installed Ecctrl is paused only during swimming. Rapier's [rigid-body controls](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/) allow the same dynamic capsule to have gravity disabled and velocity controlled; a damped surface target, bounded vertical speed and smoothed camera-relative input replace ground locomotion until the player reaches the shallows. Separate entry and exit depths avoid repeated switching at the shoreline. Elevated players on a dock do not enter swimming until they actually reach the water. A scooter rider entering the lake is dismounted and the scooter is parked on the last sampled dry ground.

Animation names and the visual origin travel through the existing multiplayer pose. Nearby peers play the same clips and wake; no protocol, durable storage or Worker changes are needed. The ordinary 220–250 m remote-character visibility limits still apply.

## Validation

The geometry and motion tests cover entry, shallow-water hysteresis, dry ground, dock height, activities, acceleration and surface stability. A Rapier capsule test crosses the real terrain shoreline and floats. The clips are checked against every bone of the accepted character, and both swim animation names pass the existing multiplayer pose parser. In an isolated two-browser room, one player entered, swam, stopped to tread water and returned to walking; the other received both swim states. A scooter test entered the lake and left the vehicle on shore. The original character GLB remains byte-identical.

A local Apple M4 Pro test at 1707 × 960 CSS pixels and DPR 1.5 held a fixed lakeside camera for 600 sampled frames. With 50 cabins and 49 animated synthetic swimmers, it measured **63.6 fps** (p95 20.6 ms); the same view with 50 cabins and no swimmers measured **120 fps** (p95 9.8 ms, display-limited). These are local render fixtures rather than 50 network clients; other hardware will differ. The compact measurements are in `performance.json`. The test fixture is excluded from production.
