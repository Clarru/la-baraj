# Planes art provenance

Generated with OpenAI ImageGen on 29 October 2026. The exact paper prompt is `paper-prompt.txt`; its production source is resized to 768×768 and encoded as WebP (quality 78) with sharp, with the prompt and creation timestamp preserved in the adjacent `.webp.json` sidecar. The exact furniture prompt is `table-prompt.txt`, and the 1536×1024 PNG reference carries its prompt in embedded metadata. The paper contains only blank paper; all grid lines, labels, outlines and game state are rendered in code for accuracy and accessibility.

- `apps/web/public/assets/planes/notebook-paper.webp` (with `notebook-paper.webp.json`): production UI and world-sheet texture.
- `table-reference.png`: art reference, not shipped to browsers. Existing `Table_Large` and `Bench` models supply the timber geometry, augmented by simple paper, pencil and sign meshes.

The feature inherits the incumbent type system: `Bree Serif` for the Planes heading and `Alegreya Sans` for body copy, controls and the in-world sign.

This extends the incumbent La Baraj art direction. No character mesh, cabin asset, font family or world identity was replaced.
