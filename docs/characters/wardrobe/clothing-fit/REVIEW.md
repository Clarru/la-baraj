# Headless clothing reconstruction

Status: **candidate; world acceptance pending**. These replace the earlier
rejected studies. The release hold remains until the frozen game review passes.
No new asset is marked accepted. Approved hats and Lakeside_Man.glb are unchanged.

## Authoring

Headless Blender only. The authoring entry points assert bpy.app.background;
the build wrapper passes --background and --disable-autoexec. Leave the open GUI
scene untouched. Offline drape and high-to-low material bakes add no runtime cloth.

The male tops use measured workshirt chest sections, continuous shoulder/sleeve
surfaces and turned cuffs. The overshirt has a folded collar, fitted pockets,
sewn detail baked into its material, small horn buttons and a narrow underlayer.
Front neckline anchors prevent the open edge crumpling during offline drape.
Trim winding is set outward; the previous inward trim shaded dark and broken.
The knit has a fitted crew opening and outward-facing hem/cuff ribs.

The female jacket retains the covered waist and shorts/thigh fit from the live
hotfix. Its shaped coat, rolled collar, lapels and welts share the body skin field;
cuff buttons follow the sleeve. The lower coat follows the pelvis. Original
face/eyes and hair remain present. Pumps use an authored curved toe/arch last,
with a low-cut upper, shortened toe, fitted heel and concealed tights volume.

Canvas shoes adapt the authored Rex shoe mesh; thin crossed cotton laces replace
the source's thick laces. The sole, foxing and upper remain separate materials.
The source character, scripts, rig and animation are excluded.

## Reproducibility and sources

- [Male guide](references/male-tops.png) and [female guide](references/female-tailoring.png)
  are generated design references, not implemented model screenshots. Prompts are
  stored beside them. The pumps deliberately retain a more pointed authored last.
- Original Quaternius CC0 base/outfit meshes and the canonical 65-bone rig are reused.
- [Canvas source](canvas-source.json): Rex, Sprite Fright — Blender Studio,
  CC-BY-4.0. Extracted mesh/UV data is checked in as rex-shoes.json.gz.
  extract-wardrobe-shoe-source.py regenerates it from the recorded source blend,
  with embedded scripts disabled. Regular builds use the data file directly.
- [Pump source](heels-source.json): MRT / Margaret Toigo, MakeHuman shoes01,
  CC0 verified in the OBJ header. The exact OBJ is checked in compressed; its hash
  is verified before building. Public credits are in wardrobe/ATTRIBUTION.md.
- Entry points: build-wardrobe-knit.py, build-wardrobe-overshirt.py,
  build-wardrobe-canvas.py and build-wardrobe-female.py. Shared helpers cover the
  canonical skin transfer, offline drape, unique UV bake and anatomical fitting.
- Editable local blend files remain under assets/source-models/wardrobe (ignored).
  Runtime exports, source mesh data, recipes and checks are committed.

## Verification

609 frontend tests pass against the candidate GLBs. TypeScript passes. Tests
cover actual chest bounds, tucked underlayer coverage, version hashes, per-player
colour isolation, retained maps and original-colour restoration. The optimizer
checks canonical inverse binds, 65 joints, skin attributes and no duplicate clips.

Offscreen renders use the actual optimized GLBs, AvatarWardrobe, Appearance
lighting and canonical animation mixer. Their reports record exact hashes and
browser errors. These do not establish world/UI acceptance or physical iPhone
thermal behaviour. The frozen shared-preview review remains required.

The close-up/pose packet contains 40 views across 10 cases: original tops and
shoes, cream overshirt in Run with long hair, rust knit in Walk with buzzed hair,
and female Idle/Wave/Run/Jump samples. All browser reports have zero page errors
and zero network requests. Contact sheets are compositions of actual renders.
These sampled views do not prove every possible outfit/animation combination.
