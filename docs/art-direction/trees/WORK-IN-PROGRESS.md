# Cinciș trees: prototype and asset audit

Status: **experimental, not integrated**. The original foliage concept and image-generated cutout informed an editable procedural GLB, but the canopy repeats its card art, its trunk is still too simple, and it has not been assessed in the game camera or under a matched performance workload. Do not replace the existing forest yet. The render is a local Three.js studio view, not a game screenshot. The generated images are references/source art, not 3D models.

## Regional direction

The [Hunedoara municipality's 2017 report](https://www.primariahunedoara.ro/files/pages_files/Raport_de_activitate_anul_2017.pdf), page 8, describes sessile oak (*Quercus petraea*, gorun) across hills from Teliuc toward Ghelari and oak–beech forest in higher parts of the area. The report concerns the wider region rather than an individual survey of the lake's shoreline. Use gorun as the first family, then consider beech for higher/more shaded hills. The [municipal annex](https://emol.ro/pluginfile.php/1/local_emol/documentanexa/111/HCL-157-2021-Anexe-Statut.pdf) describes hornbeam and shrubs including hazel and hawthorn in the municipality; exact lake-edge placement needs stronger evidence. Do not claim a shoreline inventory or assume that every present pine is native to a particular spot.

## Source and reproducibility

- `cincis-oak-concept.png`: generated reference; input was `docs/animations/captures/performance-survey-desktop.png` from the legacy workspace as a style reference. The requested result was one stylized oak in full three-quarter and side views with foliage detail, no scenery, text or props. The game screenshot depicts an earlier world build, not the current runtime.
- `oak-foliage-generated.png`: generated transparent foliage spray, used as an original image texture; see `imagegen-prompts.txt` for the exact prompts.
- `scripts/build-cincis-oak.mjs` is the editable, deterministic source; run it from the project root with Node 24 after `npm ci`. It exports `cincis-oak-prototype.glb` here. A processed 512×512 PNG is embedded in the GLB; the original remains alongside this document.
- `oak-prototype-render.png` is a studio render of the current card prototype; it is not a game screenshot.
- Current prototype: 816 triangles, two mesh/material groups, 512×512 masked PNG and 397,096-byte GLB. This is only a geometry/size comparison, **not** a frame-rate improvement. Masked cards, their overlap, shadows and reflections still cost GPU work. The current production `CommonTree_1` catalog reports 6,265 triangles and 304,208 bytes; the card prototype's PNG is larger even though its geometry is smaller.
- One failed prototype used solid faceted foliage blobs and did not resemble the reference. The card version revealed a black-padding bug during image resize; setting transparent padding fixed the rendered rectangles. Transparent borders must be checked in the export, not inferred from the source.

## Acceptance before integration

Improve trunk transitions and bark, assess repeated cards and silhouette from several camera angles, and compare the model against existing trees in the real game lighting and camera. Create an impostor from the approved actual model and verify scale, grounding, LOD transitions, trunk collision, culling, and shadow behavior. Compare matched viewport, camera, density, render passes and hardware; record frame timing and draw calls rather than inferring speed from file size. Keep the four existing species and shared preview undisturbed until the replacement is ready and integration is coordinated.

## Inventory and priorities

This is a source/catalog triage, not a complete visual or performance audit. Counts below are catalog values, not measurements of every instance in the current frame.

1. **Trees:** `CommonTree_1` (6,265 triangles), `CommonTree_3` (3,505), `Pine_2` (3,648), `Pine_4` (3,370); four source models, shared instancing and baked crossed-card distant impostors. Prioritize locally grounded broadleaf silhouette and matched LOD; retain existing assets until validated.
2. **Understory:** bush (900 triangles), fern (288), flower group (755), grass (155). Compare silhouette and density in actual play; use local hazel/hawthorn and meadow references, and measure total instances, shadow/alpha cost before changing them.
3. **Rocks and shoreline:** two primary rock models (342/244 triangles) plus pebble, terrain, water and road. Check repetition and blending against Cinciș shore references before replacing low-cost geometry.
4. **Buildings and props:** original cabin variants and interiors, plus catalog fence, door, windows, bench, table, lantern, barrel and crate. Evaluate at game scale and coordinate with the chats owning cabins and seating. A catalog count alone does not establish an art defect or a runtime bottleneck.
5. **Characters and vehicles:** custom lakeside character, animation library, scooter and planes are separate systems with existing owners. Preserve the rig, collision, controls and multiplayer behavior; review separately in motion.
6. **Fishing, last:** `character-actions.ts` constructs a simple cylinder rod, sphere/cone fish and procedural fishing line, and contains bite/reel gesture clips. Prioritize identifiable rod/reel, a locally appropriate fish silhouette, hand grip and cast/reel/catch motion once the tree workflow is proven. Verify the interaction and remote animation rather than just a static mesh.
