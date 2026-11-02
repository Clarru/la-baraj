# Rigged authoring findings

These are observed failures and the scoped corrections applied during this build.

- Blender conversion applies to all selected objects. A cap left selected when
  converting a later seam curve lost its Armature modifier, producing an unskinned
  primitive. The curve helper now clears selection before conversion. The export
  validator rejects unbound primitives; the canonical hair exports remain controls.
- Equal bone names are insufficient. All exports are checked against all 65
  approved inverse-bind matrices by bone name. Runtime attachment repeats this
  check and remaps vertex joint indices if their order differs. Actor bones and
  the approved animation library remain unchanged.
- The animation track can overwrite the armature object's review rotation. Review
  yaw now lives on a nonanimated parent; front/side/rear images are distinct.
- Nearest-surface cloth skinning transfers thigh weights into a hanging blazer.
  This produced a jagged coat hem in ordinary idle/walk poses. The lower coat now
  has continuous pelvis weights. Exact plane cuts replace face-centroid clipping
  at shorts, tights and midriff boundaries.
- Existing arm skin includes forearms. Reusing all of it under a narrow sleeve
  exposed skin through the elbows. The custom-top base retains the original face
  and hands with garment-covered neck/wrist cuts. The approved default is untouched.
- The full bare calf does not fit inside the existing high boots. Shorts now have
  fit-specific visible-leg ranges, selected from the shoe ID. Long trousers also
  have high, ankle and low shoe fits; an isolated shoe render with knee-length
  trousers is not a valid fit proof.
- Reusing atlas UVs on a whole repeating twill image produced giant diagonal yarn.
  Cargo/shorts fabric UVs now repeat at the intended fine weave scale.
- Classifying sole materials by a triangle's centroid created a jagged white edge.
  The source last is now cut at the actual sole boundary before material assignment.
- A loop collapsing to a crown pole needs planar top UVs; circumference UVs created
  concentric texture artifacts. Hat crown UVs and cap/beanie/bucket proportions are
  reviewed on the actual exports.
- Joining source parts before export reduces draw calls. The exporter joins
  temporary copies by wardrobe role and retains editable originals for fit variants.
  Geometry reduction follows silhouette construction and precedes skin transfer.
- Blender re-embeds approved WebP maps as PNG. Decoded-pixel matches now recover
  the exact approved encoded bytes. New tangent normals use lossless WebP at 512,
  and shared texture hashes support cross-item runtime reuse. Download bytes and
  decoded GPU allocation still require separate game measurements.

None of these technical checks replaces visual or gameplay acceptance.
