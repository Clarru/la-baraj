import { NodeIO } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  EXTMeshoptCompression,
} from "@gltf-transform/extensions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
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
  compression = "off",
] = process.argv.slice(2);
if (!source || !destination)
  throw new Error("Usage: node optimize_asset.mjs input.glb output.glb");
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });
const doc = await io.read(source);
const dataPixels = new Map();
for (const material of doc.getRoot().listMaterials())
  for (const texture of [
    material.getNormalTexture(),
    material.getMetallicRoughnessTexture(),
    material.getOcclusionTexture(),
  ])
    if (texture && !dataPixels.has(texture.getName())) {
      const { data, info } = await sharp(texture.getImage())
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      dataPixels.set(texture.getName(), {
        data,
        width: info.width,
        height: info.height,
      });
    }
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
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    resize: [512, 512],
    slots: /^(baseColorTexture|emissiveTexture)$/,
    quality: 90,
  }),
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    resize: [512, 512],
    slots: /^(normalTexture|metallicRoughnessTexture|occlusionTexture)$/,
    lossless: true,
  }),
);
const dataValidation = [];
for (const texture of doc.getRoot().listTextures())
  if (dataPixels.has(texture.getName())) {
    const before = dataPixels.get(texture.getName());
    const { data, info } = await sharp(texture.getImage())
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (before.width === info.width && before.height === info.height) {
      if (!data.equals(before.data))
        throw new Error(`Data texture pixels changed: ${texture.getName()}`);
      dataValidation.push({ name: texture.getName(), pixelsPreserved: true });
    }
  }
if (quantization === "quantize")
  await doc.transform(
    quantize({
      quantizePosition: 16,
      quantizeNormal: 16,
      quantizeTexcoord: 16,
    }),
  );
function geometryDigest(document) {
  const hash = createHash("sha256");
  for (const mesh of document.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics().sort()) {
        const array = primitive.getAttribute(semantic).getArray();
        hash
          .update(semantic)
          .update(
            Buffer.from(array.buffer, array.byteOffset, array.byteLength),
          );
      }
      const indices = primitive.getIndices()?.getArray();
      if (indices)
        for (let i = 0; i < indices.length; i += 3) {
          const triangle = [indices[i], indices[i + 1], indices[i + 2]],
            start = triangle.indexOf(Math.min(...triangle));
          hash.update(
            `${triangle[start]},${triangle[(start + 1) % 3]},${triangle[(start + 2) % 3]};`,
          );
        }
    }
  return hash.digest("hex");
}
let meshoptLosslessVerified = false;
if (compression === "meshopt") {
  const before = geometryDigest(doc);
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({
      method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
    });
  const bytes = await io.writeBinary(doc);
  const decoded = await io.readBinary(bytes);
  assert.equal(
    geometryDigest(decoded),
    before,
    "Meshopt changed decoded attributes or winding",
  );
  for (const texture of doc.getRoot().listTextures()) {
    const copy = decoded
      .getRoot()
      .listTextures()
      .find((t) => t.getName() === texture.getName());
    assert(
      Buffer.from(copy.getImage()).equals(Buffer.from(texture.getImage())),
      "Meshopt changed texture payload",
    );
  }
  const fs = await import("node:fs/promises");
  await fs.writeFile(destination, bytes);
  meshoptLosslessVerified = true;
} else await io.write(destination, doc);
const root = doc.getRoot();
console.log(
  JSON.stringify({
    destination,
    meshes: root.listMeshes().length,
    primitives: root
      .listMeshes()
      .reduce((n, m) => n + m.listPrimitives().length, 0),
    materials: root.listMaterials().length,
    dataValidation,
    meshoptLosslessVerified,
    textures: root.listTextures().map((t) => ({
      name: t.getName(),
      mime: t.getMimeType(),
      size: t.getSize(),
      bytes: t.getImage().byteLength,
    })),
  }),
);
