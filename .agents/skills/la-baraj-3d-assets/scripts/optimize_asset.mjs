import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  weld,
  textureCompress,
  quantize,
} from "@gltf-transform/functions";
import sharp from "sharp";

const [
  source,
  destination,
  metalTint = "1",
  quantization = "off",
  woodTint = "1",
] = process.argv.slice(2);
if (!source || !destination)
  throw new Error("Usage: node optimize_asset.mjs input.glb output.glb");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(source);
for (const material of doc.getRoot().listMaterials()) {
  if (material.getName() === "LaBaraj iron")
    material.setBaseColorFactor([
      Number(metalTint),
      Number(metalTint),
      Number(metalTint),
      1,
    ]);
  if (material.getName() === "LaBaraj timber")
    material.setBaseColorFactor([
      Number(woodTint),
      Number(woodTint),
      Number(woodTint),
      1,
    ]);
}
await doc.transform(
  weld(),
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512] }),
);
if (quantization === "quantize")
  await doc.transform(
    quantize({
      quantizePosition: 16,
      quantizeNormal: 16,
      quantizeTexcoord: 16,
    }),
  );
await io.write(destination, doc);
const root = doc.getRoot();
console.log(
  JSON.stringify({
    destination,
    meshes: root.listMeshes().length,
    primitives: root
      .listMeshes()
      .reduce((n, m) => n + m.listPrimitives().length, 0),
    materials: root.listMaterials().length,
    textures: root
      .listTextures()
      .map((t) => ({
        name: t.getName(),
        mime: t.getMimeType(),
        size: t.getSize(),
        bytes: t.getImage().byteLength,
      })),
  }),
);
