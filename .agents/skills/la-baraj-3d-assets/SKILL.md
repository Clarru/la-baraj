---
name: la-baraj-3d-assets
description: Reuse or reconstruct textured Blender props for La Baraj from licensed visual references, with measured proportions, shared materials, small GLB exports and matched-view QA. Use for static game props and compatible variants; character rigging and foliage need their own validated workflows.
---

# La Baraj 3D props

Create an editable, reproducible prop that belongs beside the existing assets. A convincing ImageGen sheet is reference material; acceptance belongs to the exported 3D object. Preserve production assets while experiments are being evaluated. Follow repository worktree and single-preview rules.

## Start from evidence

1. Find a reusable existing model, material, construction helper or licensed source before inventing geometry. Record what is reused. Keep source, generated reference and authored reconstruction distinguishable.
2. Establish dimensions, pivot, axis convention, gameplay distance and interaction sockets. Blender is Z-up; exported glTF is Y-up. Inspect a real export rather than adding guessed compensating rotations.
3. Run [inspect_asset.py](scripts/inspect_asset.py) in Blender on the reference. Use [measure_components.py](scripts/measure_components.py) when licensed source geometry is available and part positions are ambiguous. It records part bounds, not reusable topology. Otherwise derive a dimensioned landmark table from multiple views and mark unknown measurements.
4. Record the source's triangles, primitive/material groups, texture count/dimensions and actual GLB bytes. These are reference-specific budgets, not universal caps. Download bytes and GPU texture allocation are separate costs.
5. Inspect material factors, maps and UV placement with [inspect_materials.mjs](scripts/inspect_materials.mjs). If normal/roughness detail carries the reference's edge treatment, follow [surfaces.md](references/surfaces.md) before simplifying the surface or generating more color variations.

## ImageGen into Blender

Supply actual rendered references with explicit roles: target design, style anchor, prior candidate. Preserve silhouette, component count, spacing, material finish and absence of extra decoration. Request only the views needed to resolve construction. Do not rely on ImageGen's drawn dimensions or inferred rear geometry as measurements.

Evaluate a prompt against named defects. Retain exact prompts and selected outputs. Iterate when the sheet changes structure, obscures details or drifts in finish; stop generating once remaining errors are in Blender geometry, UVs or export. More prompts do not repair a wrong mesh.

Block out measured landmarks first. Use [prop_parts.py](scripts/prop_parts.py) for compatible boxes, beams, ring bands, low-cost links and profile extrusions. Extend it only for a recurring need. Inspect a real render before adding detail. Shared texture atlases may supply wood, iron and surface variation; assign explicit grain axes per part. Avoid long repeated stretches, painted lighting and UV sampling across atlas-strip boundaries.

Keep source components named and editable in the .blend; consolidate runtime meshes separately. Pack the selected reference or retain project-relative references. Author sockets alongside geometry and deliver them as explicit metadata; exporting only a joined mesh does not automatically export sockets.

## Export and judge

Use [optimize_asset.mjs](scripts/optimize_asset.mjs) with the project's glTF tooling. Its optional 16-bit quantization changes attributes: measure dimensional error and inspect the decoded export. Color textures use lossy WebP; normal and packed data use lossless WebP with decoded-pixel verification. Optional Meshopt encoding verifies decoded attributes/winding after quantization and requires runtime decoder support. Compression reduces encoded bytes; it does not shrink decoded texture dimensions.

Re-import the final GLB and render it with the reference's `metrics.json` framing. Inspect front, side, rear and three-quarter views, plus an ordinary gameplay-scale presentation. Check component placement, gaps, silhouette, bevels, grain, edge wear, normals and coplanar intersections separately. Small files cannot compensate for failed appearance.

For reflective surfaces, inspect a second light direction and check the target game's material overrides/environment. A studio render cannot establish that an importer will preserve the finish.

Run [validate_asset.mjs](scripts/validate_asset.mjs) against the reference and candidate reports to check actual GLB attributes, primitive counts and budgets. Use [compare_views.py](scripts/compare_views.py) for unchanged-render sheets and optional alpha-mask silhouette overlap. Silhouette overlap measures only projected shape, not texture, style or full 3D similarity.

Accept technical gates and visual judgment separately. Record residual differences candidly. If the candidate fails the reference's quality bar, keep it experimental and correct the observed defect. Never label it “1:1,” “perfect,” faster in-game or production-ready solely because dimensions/triangle/byte limits pass.

For demonstrated failures and current acceptance evidence, read [lessons.md](references/lessons.md). The reproducible two-prop exercise is in `experiments/asset-skill-lab/`; it is not installed into the shared world.
