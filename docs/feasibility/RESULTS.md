# La Baraj — Asset feasibility results

> Historical asset-test result: this records the earlier 16-family scene. Subsequent owner-directed work adds the 30-plot settlement, lakefront activities and image-reference cabin library; its appearance and rendering cost differ from these saved samples.

Recorded 28 October 2026, 15:45 Europe/Bucharest.

## Decision

**GO for continuing the rendering stack and reuse-heavy environment pipeline. NO-GO for the exact current Quaternius cabin/outfit combination as final art.**

We assembled and rendered 16 of the 20 environment families fixed before implementation: **80% coverage of that representative checklist**. This is a real walkable browser scene, with source assets, editable Blender work and measured rendering. It is not a finished game or a claim that 80% of production work is complete.

Retain this scene as a renderer benchmark. The nature assets are useful starting material; the rustic/medieval-derived cabin pieces and outfit do not meet the contemporary playful target. Test one cohesive contemporary kit or a focused authored cabin/character/shore cluster before expanding the world. The initial flat/serif/cream presentation, small map and stock hoodie character were rejected by the owner; those rejections are part of the test outcome, not approvals to carry forward.

## Run and inspect

- Production-shaped local preview: http://127.0.0.1:4173/
- Development: `npm run dev` at http://127.0.0.1:5173/
- Build: `npm run build`; verification: `npm test`.
- Walk with WASD/arrows, run with Shift, jump with Space, drag the camera; Survey view changes perspective; Character gives a medium-distance in-world inspection preset.
- Side controls change light, compare nearby materials, and render 30 local avatars. Inventory shows coverage/source status and exports the current measurements.

## Coverage, one family at a time

| Family | Rendered | Source / actual work | Assessment |
| --- | --- | --- | --- |
| Terrain | Yes | Authored mesh over actual geographic footprint; procedural height proxy | Technical sample only; real elevation still required |
| Shore | Yes | Geographic water edge and authored ground transition | Needs better shoreline/depth material treatment |
| Water | Yes | Three.js Water addon, procedural normals, planar reflection, matched sun | Better foundation than the discarded sine-pattern shader; art tuning remains |
| Roads | Yes | Actual OSM centerlines, authored ribbon meshes | Geographic reuse works; surface/detail pass remains |
| Footpaths | No | Reserved for cabin-to-shore paths | Untested |
| Broadleaf trees | Yes | Quaternius CommonTree 1 and 3 | Good reusable base; nearby detailed meshes and distant bakes |
| Conifers | Yes | Quaternius Pine 2 and 4 | Good reusable base; verify biome mix and density in final terrain |
| Shrubs | Yes | Quaternius Bush Common | Needs palette normalization with the main foliage |
| Grass / ground plants | Yes | Quaternius grass, fern and flowers | Useful up close; distance culling required |
| Rocks | Yes | Two Quaternius textured rock meshes | Reusable; integrate bank contacts deliberately |
| Fallen timber | No | A source model was found but not assembled into the scene | Untested; finding a download does not count |
| Cabins | Yes | Custom shell with imported roof, doors, windows and floor pieces | Useful construction test; final contemporary cabin kit unresolved |
| Docks | Yes | Custom plank/pillar assembly at the geographic edge | Cheap to author; final rail/rope/material detail remains |
| Fences | Yes | Quaternius modular fence | Direct reuse works |
| Benches | Yes | Quaternius bench | Direct reuse works; final furniture placement remains |
| Outdoor tables | Yes | Quaternius table | Direct reuse works |
| Exterior lights | Yes | Quaternius lantern fixtures | Mesh test; full nighttime lighting is not established |
| Fire pit | No | Reserved social landmark | Untested |
| Storage props | Yes | Quaternius barrel and crate | Direct reuse works; style still rustic |
| Signs | No | Reserved cabin/wayfinding assets | Untested |

Of the 16 covered families, 10 primarily use imported meshes, one is mixed cabin assembly, four are authored world surfaces/structures, and one is imported map data. **80% checklist coverage does not mean 80% of code or modeling is reused.**

There are 20 reused environment model types plus the replacement rigged character study. Character fit/animation was evaluated separately rather than padding the environment-family denominator.

## Owner-requested revisions tested

- Geographic distances expanded from scale 0.15 to 0.75: **5× length and width, 25× area**. Cabin and avatar dimensions remain human-scale. Road and shoreline transforms stay aligned.
- Cabins occupy only the selected southern road-facing bank; the opposite bank is forest.
- Rejected stock hoodie replaced by a universal humanoid assembled in Blender with authored outfit/hair/beard meshes, cloth material adaptation and 11 retained clips. The outfit is a test candidate, not approved final clothing.
- Two improvised clothing edits were rejected due to poor fit. Reusing an authored fitted outfit was faster and more reliable than procedurally slicing a body mesh. This is a concrete reason to source proper contemporary outfits rather than assume code can cheaply replace character art.
- New water foundation supplies real scene reflections and a consistent sky/sun direction. Water depth, bank translucency and final look remain art work.
- HUD changed to self-hosted Barlow/Barlow Condensed, Phosphor icons, neutral slate surfaces and underlined navigation. No marketing headline over the world.
- Nearby detailed trees switch to Blender-baked native-alpha distant representations; small foliage disappears at distance. The wider map is not populated with full-detail meshes everywhere.

## Measured rendering

Machine: Apple M4 Pro, 48 GiB RAM. Browser: in-app Chromium (Chrome 155 user agent). These are **local rendering samples**, not a network, physics-server, hosting-cost or 30-device test.

Measured user viewport: about 1090 × 1181 CSS pixels, renderer pixel ratio 1. Each saved sample covers the latest 600 settled frames, roughly 5–8 seconds (exact intervals are saved per run). Loading and frame stalls above 500 ms are excluded by the diagnostic. A ~120 fps result is near the observed refresh ceiling and is not evidence of unlimited headroom.

| Case | Mean fps | Mean frame | p95 frame | Triangles across render passes | Draw calls across render passes |
| --- | ---: | ---: | ---: | ---: | ---: |
| On foot · 1 character | 120.0 | 8.33 ms | 9.20 ms | 3,447,059 | 196 |
| On foot · 30 animated characters | 108.1 | 9.25 ms | 11.80 ms | 4,130,174 | 536 |
| Survey · 30 animated characters | 85.0 | 11.77 ms | 13.80 ms | 2,468,496 | 1,384 |

Source records: [baseline](baseline-metrics.json), [30-character walking](crowd-metrics.json), [30-character survey](survey-metrics.json). Reflection/shadow work is included by collecting renderer statistics across passes; these are not unique mesh-triangle counts.

Before distance-detail switching, the wide 30-character view was about 46 fps and 13.5 million rendered triangles. The final wide sample above uses distance detail, with the final camera and placements; it is not a perfectly controlled before/after benchmark. This exposed a real implementation constraint: a bigger map needs distance detail and spatial grouping, not merely more geometry.

**Limits:** this is a high-end Mac. Integrated/older GPUs, 1080p/retina resolutions, sustained sessions, memory churn under repeated toggles, and 30 independent network clients are not certified. The narrow-screen capture tests UI layout only; the current walking controls require a keyboard.

## Bugs found during owner playtest

The owner exposed three concrete defects after the initial assembly: modular outfit/animation bind mismatch, two overlapping terrain surfaces with only one collision surface, and duplicate controller/model yaw. The character mesh was rebound to the animation skeleton; terrain now uses one continuous mesh for both rendering and collision; the controller body has rotation locked and the visual model owns facing. A downward ground ray places the soles on the actual collision surface. A physical lake-edge boundary replaces the water-triggered reset. The remaining below-world reset is only a fall-recovery guard.

All four WASD samples have heading alignment of approximately 1.0 against travel velocity. The saved water-edge sample stays outside the lake after five seconds of forward input; it remains on the shore rather than returning to spawn. Evidence: `movement-checks.json`, `water-boundary-check.json`, `world-collision.test.ts` and the final in-world capture.

## Capture provenance

Every final capture in `captures/` has a same-name JSON sidecar containing its run UUID, timestamp, viewport, camera preset, light/material/avatar states, timing window and render counters. These showcase captures use 1440 × 901 or 390 × 844 viewport crops; they are separate from the 1090 × 1181 benchmark population. The counters describe the previous complete render frame across main/reflection/shadow passes; timing values describe a rolling window and are not synchronized per-frame GPU timings. A small delay between reading diagnostics and taking the screenshot is expected.

[In-world character inspection](captures/character-in-world.png) uses the game’s afternoon light. [Offline character study](character-v2.png) uses a separate Blender studio rig and is not a matched-light comparison. The game character is now readable without the previous roof occlusion; its rustic outfit remains a failed style candidate.

## Asset weight and cost

The final used models plus distant-tree sprites total **5,600,880 bytes (about 5.60 MB)** on disk, excluding the app JavaScript and fonts. The main app bundle is about 1.26 MB gzip; the build currently reports a bundle-size advisory. All visual assets are served locally, with no asset CDN or geocoding request required during play.

The first raw model selection was 63.13 MB and its optimized selection was 5.17 MB. The revised used set differs because the character was replaced and tree bakes were added, so those two stages are not a like-for-like final reduction calculation.

No paid pack, paid hosting plan, AI inference service or cloud deployment was purchased for this test. Existing software/account costs are not valued as zero development effort.

## Time / effort evidence

This report was generated approximately **77 minutes** after the recorded test start at 14:28:58 Europe/Bucharest. That elapsed session includes asset research/download friction, implementation, owner feedback, rejected attempts, Blender setup/work, browser checking and documentation; it is not a clean isolated per-asset labor benchmark.

The first running scene was visible after roughly 13 minutes. It failed the owner's scale/character/UI expectations. The richer revised test required the additional work described above. We did not time every family independently and should not invent per-model estimates from the total.

Integration phases (approximate elapsed session observations, not isolated labor): first scene 0–13 minutes; subsequent work combined owner-led scale/UI/environment revisions, character fitting and rejected clothing approaches, final Blender assembly, distance-detail optimization, browser verification and documentation. Those later phases overlapped and were not separately clocked. No per-family times were logged, so the experiment supports the total integration envelope rather than an exact asset-by-asset speed promise.

The fast part was loading and composing licensed environment meshes. The costly part was coherent art: character fit, matching materials, believable water/ground, geographic scale and rendering the larger forest efficiently. A free download is not automatically a cheap finished asset.

## Verification and evidence

- Six automated checks pass: matching visible/collision terrain at 24 shoreline samples, a simulated capsule blocked at the water edge, valid shipped catalog GLBs/retained clips, stable geographic transform, southern land-based cabin placement, and the fivefold extent change.
- Typecheck and production build pass. Bundle-size advisory remains.
- Browser checks exercised walking, jump input, reset, camera modes, light/material switches, inventory, the local 30-character option and narrow UI. No errors were recorded in the final preview tab.
- [Desktop survey](captures/desktop.png), [desktop walking](captures/walking-desktop.png), [inventory](captures/inventory-desktop.png), [narrow UI](captures/mobile.png), [evening](captures/evening.png).
- [Offline Blender character study](character-v2.png); editable source: `assets/blender/Lakeside_Character.blend`.
- The Blender study was built/exported/rendered through the owner's installed Blender 5.2.3. Loading it through the current GUI window timed out in automation; the previous untitled workspace was first saved to `assets/blender/Workspace_Backup_20261028_1508.blend`.
- Screenshots retain their unaltered source captures alongside viewport crops. Cropping removes an unused margin introduced by the IAB screenshot backend; it does not enhance or repaint the scene.

## Source and license evidence

- Quaternius source pack pages and the exact copies' CC0 notices: `third_party/quaternius-*-LICENSE.txt`, `apps/web/public/assets/source-manifest.json` and `asset-catalog.json`.
- Character base/animations/outfit notices and hashes: `assets/character-source/PROVENANCE.json`, `base-LICENSE.txt`, `animation-LICENSE.txt`, `outfit/License_Standard.txt`.
- Tree bake metadata: `apps/web/public/assets/impostors/manifest.json`; each PNG records its source origin.
- Map source/version/hashes and ODbL: `assets/geography/source-manifest.json` and `DATA_LICENSE.md`.
- Fonts: self-hosted Fontsource Barlow families with SIL OFL notices. Icons: Phosphor package license.

Large downloaded source caches and `.blend` files are retained locally but ignored by Git. The original source assets and provenance are available for inspection; the game exports are separate.

## What this establishes, and the next decision

The selected browser stack and reuse pipeline can produce a small navigable asset study quickly, carry the larger map, and render the tested local crowd at useful frame rates on this Mac. The environment sources cover the representative 80% target.

**The exact current free cabin/outfit combination is rejected for the richer final art target.** Nature is the strongest reusable part. Contemporary cabins/outfits, real terrain elevation, ground/shore materials and water treatment need a focused art pass or a better-matched kit. Blender is a useful part of that workflow, but having it installed does not remove the modeling/rigging/material effort.

Proceed with the stack and retain the reusable nature/rendering work. Test a coherent contemporary replacement cabin/character/shore cluster before wider population. Multiplayer, ownership, trophy theft, punching, fishing and persistent saves remain a separate implementation phase after this asset experiment.
