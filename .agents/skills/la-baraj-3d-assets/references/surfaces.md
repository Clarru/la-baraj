# Inspect the surface system before simplifying it

Use this when a textured prop looks flat, chalky, plastic or loses the reference's edge shine.

## What the Quaternius files actually contain

The retained `MI_Trim_Metal` material uses base-color, tangent normal and metallic/roughness maps, all 512x512. Metallic and roughness scalar factors are both 1; they multiply the texture channels, they do not make every texel fully metallic or fully rough. Green encodes roughness and blue metallic. The red channel is unused by this export because it has no occlusion texture connection.

The normal atlas visibly contains rounded borders, panel dents, collars and rivet details. The base-color map also contains pale edge wear. A controlled render with only the normal map removed loses much of the broad edge highlight; reducing metalness and removing the reflection map flattens it further. This establishes contributing layers, not the author's exact historical software/process.

The earlier reconstruction used metalness 0.05, constant roughness 0.78 and one color image. It preserved broad color but omitted important surface behavior. Do not call that an equivalent material system just because it is cheaper.

## Reuse a coordinated trim set

Use [inspect_materials.mjs](../scripts/inspect_materials.mjs) to extract licensed reference maps and factors. Inspect the maps and their UV layout. Never copy an arbitrary region of a normal map onto unrelated UVs and expect the encoded bevels to land on physical edges.

For an original surface in the demonstrated four-strip family, [bake_prop_trim.py](../scripts/bake_prop_trim.py) creates a coordinated set from the retained ImageGen color atlas:

- Base color: edge-aware wear mixed with the generated painterly surface. Do not bake directional light or cast shadows into it.
- Tangent normal: selected-to-active bake from our own rounded canonical slabs, with restrained bump detail. The high-poly bake pieces are offline authoring tools, not runtime geometry.
- Metallic/roughness: separate control of rough painted body, smoother worn edge, and non-metallic timber. Red is neutral 1, not an AO bake.

The runtime UVs span the corresponding trim region so its rounded border aligns with the face perimeter. True bevel faces and small rivets sample the flatter/light region rather than adding another fake rounded border on top. A lighter panel trim can be used on iron caps. Canonical bake dimensions are not universal real-world bevel sizes: UV scale determines the apparent width on each prop.

Blender export needs the normal image marked **Non-Color**, through a Tangent Space Normal Map node into Principled Normal. The packed reflection map is also Non-Color, with green wired to Roughness and blue to Metallic. Color images remain sRGB. Check the exported GLB's connections, not just the source nodes.

One failed bake reused the primitive cube's original UV layer while adding a second layer. All color strips then sampled timber. Reuse/set the intended active render UV layer explicitly. Before assigning a baked set, inspect all three images; never accept them because the bake operator returned success.

## Verify the real result and its cost

- Keep camera/lighting matched for original, previous pass and new pass. Inspect a second light direction to see the changed reflection response; a pale painted line by itself is not a moving specular highlight.
- Preserve data maps carefully. The exporter uses quality-90 WebP for color, lossless WebP for normal/packed data, and verifies decoded data pixels. Avoid silently spending the shader improvement on destructive recompression.
- Optional Meshopt encoding is verified against decoded attributes, triangle winding and image payloads. This is lossless **after** the separately documented 16-bit quantization. Verify decoder support before choosing it for another runtime.
- `validate_asset.mjs` accepts an optional reference-materials JSON after its output path. When all reference materials contain normal/reflection maps, it rejects candidates that drop those layers. This gate complements visual review, not a replacement for it.
- Three textures still require more texture samples/storage than the former color-only pass. The correct comparison is against the reference's surface quality and budget. A compressed download size is not a GPU-memory or frame-rate measurement.

## La Baraj integration check

At the experiment's base, `apps/web/src/assets.tsx` caps the imported metalness factor at 0.15. Normal maps remain connected in normal textured mode; the explicit flat/debug mode clears them. The roughness clamp is on the scalar factor, not a per-texel minimum. Recheck the latest integration code before installation.

The world does not currently assign a global reflection environment in these files; the boat has its own cached PMREM gradient. A future integration should evaluate a targeted surface profile and a suitable shared reflection source under the actual day/night lighting. Do not remove the clamp globally or replace the world lighting as an asset-export side effect. The current study changes no game runtime code.

Official implementation references: [Blender glTF materials](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html), [normal baking](https://docs.blender.org/manual/en/latest/render/cycles/baking.html), [bevel shading versus geometry](https://docs.blender.org/manual/en/latest/render/shader_nodes/input/bevel.html).
