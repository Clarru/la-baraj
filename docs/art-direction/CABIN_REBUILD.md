# Cabin reconstruction

The owner rejected the first experimental cabin assemblies and requested an imagegen reference grid to guide actual modeling. The authoritative [reference sheet](cabin-reference-grid.png) was generated with the built-in image_gen tool using the exact saved [prompt](cabin-grid-prompt.txt). It is concept art, not the game render.

The three complete models are reconstructed in Blender from the reference columns: a honey-timber gable with deep covered veranda and truss; an evergreen A-frame with loft glazing, deck and side dormer; a sage cabin with offset covered entry. Roof pitches, structural thickness, cladding directions, window reveals, foundation blocks, steps, lanterns, benches, chimneys and planters come from those references. Window bays use shallow interior details rather than playable rooms. Material/weathering and landscaping are simpler than the generated sheet.

[Actual Blender render](cabins-blender-final.png). Editable source: `assets/blender/Reference_Cabin_Library.blend`. Build: `scripts/build-reference-cabins.py`; export preparation: `scripts/optimize-cabins.mjs`. Runtime GLBs and dimensions/bytes are recorded in `apps/web/public/assets/cabin-library.json`. They total 3,836,016 bytes before transport compression and are downloaded as three shared models, not thirty unique model files.

The 30 stable plots remain split equally on either side of the southern road. Cabins retain recognizable complete architectural forms; the discarded random roof/shell combinations are no longer used. The lakefront common spaces and northern forest separation remain intact. Cabin numbers identify plots; ownership and cross-device persistence are future work.

Production checks: the typecheck/build and current regression suite pass. Desktop browser captures under `docs/feasibility/captures/reference-*.png` show each archetype in the game. Capture sidecars record run/viewport state; these showcase frames do not constitute a new multiplayer or sustained performance benchmark. Mobile optimization/testing was explicitly deferred by the owner.

The old roof and character GUI workspaces were saved to backup files before switching Blender to the new cabin library. Background export/render invocations exited normally. The current GUI source is `Reference_Cabin_Library.blend`.


## Variation and home-navigation extension

The additional [imagegen grid](cabin-variants-grid.png), [exact prompt](cabin-variants-prompt.txt), and [actual Blender render](cabin-variants-blender.png) establish three more designs: dusty-blue wraparound veranda with terracotta roof, copper covered A-frame, and ivory/forest-green pergola cabin. The runtime library now has six designs. `cabin-designs.ts` assigns five of each through a stable seeded shuffle and supplies consistent model footprints, porch collision/support regions, and wall/post number mounts. `build-cabin-variants.py` reuses the established construction helpers and exports only the new models.

Number tests raycast against all six actual GLBs, verifying that plate backs are within five centimetres of their intended geometry and sit above 1.5 metres. This removes the prior generic stair-fascia placement. The number itself remains local dynamic text so cabin IDs stay stable across designs.

Home navigation uses a browser-local plot selection and a restrained world label/porch light, with the same home symbol on the directional minimap. M changes map size; H or the Home control focuses the exterior. Actual interiors, room entry, invitations and administrator access are not implemented. User-approved future access requires the owner to grant a visit, while administrator entry must be checked by the server.

Current integration verification: production build and 55 tests pass. The new design/nav tests also pass independently; live browser checks confirmed directional map movement, M expansion and H/Home focus. Final desktop screenshots and JSON sidecars are `home-navigation-user`, `home-navigation-desktop`, `home-map-expanded-desktop`, `cabin-number-*`, and `cabin-variant-*` under `docs/feasibility/captures/`. No mobile work or new performance benchmark was performed. Bench/sitting implementation is delegated to the other task and was preserved here.
