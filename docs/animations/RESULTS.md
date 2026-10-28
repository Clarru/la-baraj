# Local animations, ground contact and desktop performance

Built on 28 October 2026 in the shared Lake Cinciș source tree, alongside the separate house-art chat. The isolated production preview is http://127.0.0.1:4174/; its output directory is `dist-animations`. This work did not replace the house chat's `dist` / port 4173 build.

## Implemented controls and motion

- F near a campfire bench: sit down, then seated idle. F or Escape: stand up. E lights/puts out the fire while seated or nearby.
- E near a shore fishing spot: cast, wait, bite; E during the bite reels, shows the caught fish, then releases movement. E/Escape can cancel waiting; an expired bite returns control.
- Authored source-library sit enter/idle/exit, throw/cast, hold and pickup/catch clips are extracted into a ~492 KB supplement. The accepted character mesh and appearance are preserved. Small additive bite/reel gestures restore cleanly; the rod follows the right hand, the line follows the float, and a fish appears in the left hand during catch.
- A lit fire now has animated flame volumes, glowing coals, bounded rising embers and flickering light without shadow casting. Reduced motion freezes the flame motion and removes rising embers.
- The loading fallback has restrained motion, actual Three loading-manager progress and an explicit indeterminate state, with reduced-motion support. It adds no artificial loading delay.

## Grounding without house-file conflicts

`CabinGroundContacts.tsx` is mounted as a sibling of the existing settlement. It leaves all house models, level transforms and fixed physics bodies alone. Terrain-only physics rays sample their footprints, extend the low stone plinth to the actual ground triangles, and supply porch supports. Support rendering uses one skirt mesh and one instanced post draw rather than per-house dynamic bodies.

The runtime diagnostic verified **30 cabins**, **480 skirt triangles**, **120 porch supports**, and a largest sampled original plinth gap of **0.625 m**. Tops remain level; support feet extend into sampled terrain. Structural dimensions reflect the current Gable / AFrame / Sage source kit; update this small adapter if the house-owning chat changes those footprints. [Visible foundation check](captures/level-foundations.png) and same-name JSON contain runtime evidence.

## Bounded optimization

Forest placement groups are stable across the once-per-second HUD metrics render, and Vegetation is memoized. Distant trees share four geometry/material pairs instead of 107, eliminating 103 independent geometries and 103 material objects without reducing density or changing the art. Duplicate renderer-driven LOD switches were removed. No terrain rewrite, mobile work or broad delivery-architecture changes were added.

Final integrated samples, at about 1089×1181 CSS pixels, DPR 1, one local avatar, daylight, textures enabled, 600-frame rolling windows:

| View | Mean fps | Mean frame | p95 frame | Complete-frame draws | Triangles across passes |
|---|---:|---:|---:|---:|---:|
| Walking | 71.7 | 13.95 ms | 16.30 ms | 340 | 2,893,924 |
| Survey | 67.1 | 14.89 ms | 16.90 ms | 1814 | 2,442,555 |

These are short local samples on the development Mac, not a matched before/after comparison or network-capacity measurement. The house scene was also changing concurrently. Reflection/shadow passes are included in renderer counters; frame timing is a rolling CPU/browser interval rather than isolated GPU timing. Existing diagnostics exclude stalls above 500 ms, so loading is not represented by these averages. The source-level allocation reduction is established; no specific fps gain is attributed to it.

## Verification

- TypeScript and isolated production build passed; 26 tests across 5 files passed.
- Fresh read-only correctness review reported no material findings within the animation/control/resource-lifecycle scope.
- Browser QA verified seated contact and inward facing, E fire while seated, stand-up back to walking, full cast→wait→bite→reel→catch→idle, saved catch feedback, camera-change cancellation during fishing, and reset while seated followed by working WASD movement.
- Runtime foundation queries reached all 30 cabins; one close foundation composition was visually inspected. Raw captures and JSON state records accompany viewport-only crops. No screenshot pixels were enhanced or repainted.
- Loading fallback was observed in the live scene's accessibility state. A screenshot attempt during document reload failed; no loading screenshot is claimed.
- House art/model/source files remained under the other chat's ownership. Agents used GPT‑6.1 Sol with high reasoning, with explicit file ownership; root integrated and verified their work.

Evidence: [seated fire](captures/seated-fire-desktop.png), [fishing hold](captures/fishing-wait.png), [reel](captures/fishing-reel.png), [catch](captures/fishing-catch.png), [reset recovery](reset-recovery.json), [performance source findings](../coordination/PERFORMANCE.md).
