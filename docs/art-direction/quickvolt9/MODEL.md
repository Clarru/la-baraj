# QuickVolt 9 stylized model

The implemented scooter follows `game-reference-stylized.png`, selected after the initial reference was corrected toward a clearly stylized game treatment. Product-photo and image-generation provenance are in [SOURCE.md](SOURCE.md). Neither reference is used as a runtime texture.

The geometry is original project code in `apps/web/src/scooter-geometry.ts`. It uses the existing Three.js dependency and its MIT-licensed geometry merge/export helpers. No external scooter mesh, font, texture, or additional runtime dependency is included. The tiny product identifier is original stroke geometry.

## Artifacts

| File | Purpose |
| --- | --- |
| `apps/web/src/scooter-geometry.ts` | Authoritative reusable geometry, materials, standing contact metrics, steering transform, and wheel motion helper |
| `apps/web/src/scooter.tsx` | Imperative runtime rig and parked-state handoff |
| `apps/web/public/assets/vehicles/QuickVolt9_Stylized.glb` | Same geometry exported with named deck, wheels, steering, cockpit, rotor, and kickstand nodes |
| `assets/blender/QuickVolt9_Stylized.blend` | Editable imported geometry, packed selected reference image, and separate preview studio collection |
| `docs/art-direction/quickvolt9/model-blender-preview.png` | Render of the actual editable Blender model |
| `scripts/export-quickvolt.mjs` | Reproducible geometry-to-GLB export |
| `scripts/build-quickvolt-blender.py` | Reproducible headless GLB import, packed reference setup, Blender save, and preview render |

## Dimensions and contacts

The current model is 1.128m long, .58m across the handlebars, and 1.135m tall. Wheel outer radius is .108m, axle spacing .88m, and the standing deck top is .18m. The model origin is on the wheel-contact ground plane; +Y is up and +Z is forward. Blender's glTF importer converts this to Blender's Z-up scene convention.

`SCOOTER_METRICS` exports forefoot bone targets at `[-.045,.205,.12]` and `[.045,.205,-.16]`. Neutral grip targets are `[-.26,1.10,.30]` and `[.26,1.10,.30]`. `scooterGripPosition(side, actualSteeringAngle)` rotates those contacts around the same sloping axis as the visible cockpit. `ScooterHandle.steeringAngle` supplies that actual damped angle in radians; the motion input `steer` is normalized -1..1.

The rider stands with fixed staggered feet. Wheel rotation follows travelled distance, the front rotor rotates with its wheel, and the handlebar/stem/fork assembly steers together. The parked model deploys its kickstand; the mounted model hides it. There is no pedal or bicycle rig.

## Budget and materials

The full model is 22,200 triangles and 25 draw calls. Front and rear hub/tire geometry is shared, static pieces are merged by material, and owned geometries/materials are disposed on unmount. The game uses the code-native rig; the GLB is an editable export of exactly that geometry. A subsequent Blender edit must be deliberately exported/integrated rather than silently replacing the code-native source.

The palette intentionally belongs to the world prop and is independent of the HUD tokens: blue-charcoal body `#344153`, dark edging `#202a35`, rubber `#171d24`, gray grip tape `#777b88`, metal `#b2b6b9`, red suspension `#dc3528`, amber reflectors `#ed9d31`, warm lamp `#fff1bf`, and display blue `#55a7b6`. The design detector's palette findings are advisory comparisons with the HUD palette.

## Rebuild

From the project root, with the existing Node and Blender installations:

```sh
node --experimental-strip-types scripts/export-quickvolt.mjs
"~/Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender" --background --python scripts/build-quickvolt-blender.py
```

The Blender script creates a new background process and writes only the scooter source and its preview. It does not open or modify the running Blender window or the house library.

Validation: eight scooter contact, motion, dimensions, finite geometry, sharing, and steering-alignment tests pass. A targeted strict TypeScript check of the model, wrapper, state contract, and tests also passes.
