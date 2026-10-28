# La Baraj — Current five-block visual direction contract

Status: provisional asset-test direction, 28 October 2026. This is the local feasibility HUD and world-study contract. It records the implemented inspection apparatus; it does not approve the current 3D art as final.

## 1. THESIS

Show a real, spacious lake and a playable stylized environment assembled from actual assets. Evaluate the result honestly against the richer playful 3D target, rather than equating asset coverage with production polish.

## 2. OWN-WORLD

Use the actual Cinciș shoreline and roads, a fictional southern settlement, and a forested north bank. Cabins, docks, and people retain human scale. Geographic distances are 5× the first test, using uniform 0.75× real horizontal scale. Terrain heights remain a labeled procedural proxy.

Visual assets are textured Quaternius nature and modular village/prop meshes alongside six complete whole-house designs distributed five each by the stable Fisher–Yates shuffle in `apps/web/src/cabin-designs.ts`: Timber veranda, Forest A-frame, Sage porch, Blue wraparound, Copper shelter, and Ivory pergola. The original three follow `docs/art-direction/cabin-reference-grid.png`; the additional three follow `docs/art-direction/cabin-variants-grid.png`, generated with the built-in image_gen tool from `docs/art-direction/cabin-variants-prompt.txt`, and are rendered in `docs/art-direction/cabin-variants-blender.png`. The six runtime GLBs are catalogued in `apps/web/public/assets/cabin-library.json`, with editable source at `assets/blender/Reference_Cabin_Library.blend`; only this library is active there and prior scene workspaces are retained as backups. All cabin number plates use validated author-defined post/wall mounts above 1.5m with raycast geometry gaps below 5cm. A local home marker, porch light, and north-up real-geography minimap add navigation cues; these do not establish ownership. A rigged universal character study is assembled and adapted in Blender; the initial hoodie character is rejected. Reflective water uses the Three.js Water implementation with authored procedural normals and matched sky/sun direction. Distant vegetation uses native-alpha tree bakes from the actual source meshes; nearby trees retain detailed geometry.

## 3. STORY

Enter the 3D world immediately. Walk or switch to a survey view, Cabins inspection view, Home view, or Character inspection view, use keys 1 through 6 to cycle the fixed cabin designs, use M to expand the north-up minimap, and use H or the Home button to focus the locally selected home. Compare light and close-asset materials, open the source/coverage inventory, and run a clearly labeled 30-avatar rendering test. These are local-preview and asset-test controls, not multiplayer presence or completed gameplay.

## 4. FIRST VIEWPORT

The lake leads. A compact uppercase location plaque, underlined camera controls, clear keyboard hints, a local home marker, a north-up minimap with cabin/fishing/campfire landmarks, a small coverage readout, and a live rendering diagnostic remain at the margins. No marketing headline sits over the world. The inventory names what is imported, adapted, custom, map data, and untested. The map uses the existing Barlow/Phosphor/slate UI identity with restrained geography colors.

## 5. FORM

This is a code-first asset feasibility experiment. Concept seed e9c6015e was run; the playable-world brief and subsequent visual corrections govern this work. Keep scene-first composition and explicit provenance as the useful disciplines. The six-design cabin library is a faithful Blender reconstruction target from imagegen-referenced sheets, not a pixel-perfect reproduction or final-style approval. Visits require the owner's approval, while administrator entry is independent of owner approval; both are separate from local home selection. Local furnished interiors and door entry are implemented; cabin ownership, owner-approved visits and administrator authentication remain future work. Multiplayer room invitations are a separate existing feature.

The prior 16-family feasibility report and its rejection of the earlier free cabin/outfit combination are historical. The current six-design library supersedes those cabin pieces for this documentation pass, while real terrain elevation, final shoreline/water depth treatment, final outfits, game interactions, and multiplayer performance remain unestablished by this asset experiment. Final verification passed the parent build with 55 tests and the reviewer build with 65 tests across 14 files; live H/Home focus, M expansion, and six-design inspection keys were verified with zero console errors. Final home-navigation, minimap, cabin-number, and cabin-variant captures with JSON/raw sidecars are retained under `docs/feasibility/captures/`. Desktop-only inspection is current scope; mobile work is deferred.

## Completed cabin cutaway port

The active cabin uses a fixed Sims-style front/roof cutaway within the rendered outdoor world. `cabin-cutaway.ts` derives the retained original deck/foundation and removes the foreground room door/frame; no screen blackout is used. The same physical doorway anchors a 0.72s kinematic Walk-to-Idle crossing and 0.8s camera blend. All three furnished room families keep floor/wall and furniture collision. The fixed cutaway does not dynamically reclassify walls around every camera angle.

Original Blender/imagegen references are retained in `docs/art-direction/interiors/`; the EA interaction reference is https://www.ea.com/games/the-sims/the-sims-4/features. Legacy browser evidence is retained as the four `sims-final-*` captures named in PRODUCT.md. The dedicated branch passed 90 frontend tests, TypeScript and its own production build; it did not start a server or replace production. The release multiplayer hooks are preserved; network cabin ownership and visit approval are outside this port.
