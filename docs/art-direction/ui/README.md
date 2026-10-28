# La Baraj illustrated UI

The existing La Baraj sign is the reference for this UI expansion. The public
game keeps its quiet HUD and all existing actions. This change does not alter
the world, character models, movement or multiplayer protocol.

## Generated assets

All four assets were generated using the built-in `image_gen.imagegen` tool
with the existing `apps/web/public/assets/brand/la-baraj-banner.webp` as a style
reference and genuine alpha transparency requested. Exact prompts are saved in
[prompts.json](prompts.json).

| Runtime asset | Purpose | Size |
| --- | --- | --- |
| `apps/web/public/assets/ui/sign-plaque.webp` | Nine-slice buttons, status and cabin signs | 90,248 bytes |
| `apps/web/public/assets/ui/parchment-panel.webp` | Nine-slice menu, map, notices and prompts | 131,420 bytes |
| `apps/web/public/assets/ui/pictograms.webp` | Sixteen matching raster symbols in one atlas | 345,568 bytes |
| `apps/web/public/assets/ui/lake-vignette.webp` | Decorative loading illustration | 217,650 bytes |

The generated PNG originals remain in the session's ImageGen output directory.
The project uses the WebP copies above. Sharp performs only transparent-margin
trimming, resizing and WebP encoding; the artwork itself comes from ImageGen.
The four delivered images total 784,886 bytes. The atlas is fetched as one shared
image instead of sixteen independent files. `GameArt.tsx` clips individual
painted bounds using SVG image viewports; no line-icon substitute is drawn.

Frames use CSS `border-image` with a filled center. Their corners and nails keep
their shape while their centers stretch to fit content. All live labels remain
HTML text: names, counts, cabin numbers, button labels, prompts and loading
status are never baked into a bitmap.

## Typography

Short headings use [Bree Serif](https://fonts.google.com/specimen/Bree+Serif).
Supporting text uses [Alegreya Sans](https://github.com/huertatipografica/Alegreya-Sans)
400/700. Fontsource 5.3.0 packages supply self-hosted WOFF2 Latin and Latin
Extended subsets in `apps/web/public/fonts/`, including Romanian diacritics.
Their SIL Open Font License files are preserved in `third_party/`.

## Validation

The existing 116 frontend tests and the production TypeScript/Vite build pass.
Browser inspection covers loading, the default HUD, menu, controls, map expansion
and contextual prompts. Keyboard focus, dialog focus restoration, Escape,
disabled actions, progress semantics and network error/retry behavior retain
their existing implementation. Decorative icons are hidden from accessibility
APIs while controls retain their readable names.

Desktop keyboard play remains the target; no mobile gameplay certification is
claimed. Existing bundle-size and Three.js CommonJS warnings predate this UI.
The approved character asset must remain byte-identical to the current main.
