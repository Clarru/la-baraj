/** Lossless transport encoding only. Never simplifies, quantizes, recolors or touches the character. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  EXTMeshoptCompression,
} from "@gltf-transform/extensions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });
const root = "apps/web/public/assets";
const names = [
  "CommonTree_1",
  "CommonTree_3",
  "Pine_2",
  "Pine_4",
  "Bush_Common",
  "Fern_1",
  "Grass_Common_Short",
  "Flower_3_Group",
  "Rock_Medium_1",
  "Rock_Medium_2",
  "Bench",
  "Table_Large",
  "Prop_WoodenFence_Single",
  "Crate_Wooden",
  ...[
    "Gable",
    "AFrame",
    "Sage",
    "GableBlue",
    "AFrameCopper",
    "SagePergola",
  ].map((n) => "Lake_Cabin_" + n),
  ...["Timber", "AFrame", "Sage"].map((n) => "Lake_Interior_" + n),
];
const old = JSON.parse(
  await fs
    .readFile(`${root}/static-compression.json`, "utf8")
    .catch(() => '{"models":[]}'),
);
const records = [];
const pending = [];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const buffer = (array) =>
  Buffer.from(array.buffer, array.byteOffset, array.byteLength);
function geometryDigest(doc) {
  const h = createHash("sha256");
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) {
      for (const semantic of p.listSemantics().sort())
        h.update(semantic).update(buffer(p.getAttribute(semantic).getArray()));
      // The triangle codec may rotate a triangle's first corner; winding is preserved.
      const indices = p.getIndices()?.getArray();
      if (indices)
        for (let i = 0; i < indices.length; i += 3) {
          const t = [indices[i], indices[i + 1], indices[i + 2]],
            m = t.indexOf(Math.min(...t));
          h.update(`${t[m]},${t[(m + 1) % 3]},${t[(m + 2) % 3]};`);
        }
    }
  return h.digest("hex");
}
for (const id of names) {
  const path = `${root}/optimized/${id}.glb`,
    before = await fs.readFile(path),
    doc = await io.read(path);
  if (
    doc
      .getRoot()
      .listExtensionsUsed()
      .some((e) => e.extensionName === "EXT_meshopt_compression")
  ) {
    const saved = old.models.find((m) => m.id === id);
    assert(saved, `Already compressed without provenance: ${id}`);
    assert.equal(
      hash(before),
      saved.sha256,
      `Compressed asset changed outside this pipeline: ${id}`,
    );
    records.push(saved);
    continue;
  }
  const beforeGeometry = geometryDigest(doc);
  const originalTextures = doc
    .getRoot()
    .listTextures()
    .map((t) => hash(t.getImage()));
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({
      method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
    });
  // The name QUANTIZE is the codec mode; NO quantize transform is applied.
  const bytes = await io.writeBinary(doc);
  const decoded = await io.readBinary(bytes);
  assert.equal(
    geometryDigest(decoded),
    beforeGeometry,
    `${id} changed decoded geometry`,
  );
  assert.deepEqual(
    decoded
      .getRoot()
      .listTextures()
      .map((t) => hash(t.getImage())),
    originalTextures,
  );
  const compressed = bytes.length < before.length * 0.9;
  const output = compressed ? bytes : before;
  if (compressed) pending.push([path, output]);
  const record = {
    id,
    compressed,
    beforeBytes: before.length,
    bytes: output.length,
    originalSha256: hash(before),
    sha256: hash(output),
    geometrySha256: beforeGeometry,
  };
  records.push(record);
  console.log(
    id,
    before.length,
    "→",
    output.length,
    compressed ? "" : "(kept original)",
  );
}
for (const [path, bytes] of pending) await fs.writeFile(path, bytes);
await fs.writeFile(
  `${root}/static-compression.json`,
  JSON.stringify(
    {
      encoding:
        "EXT_meshopt_compression, lossless vertex data; no simplification/quantization; textures unchanged",
      models: records,
    },
    null,
    2,
  ) + "\n",
);
for (const filename of [
  "cabin-library.json",
  "interior-library.json",
  "asset-catalog.json",
]) {
  const path = `${root}/${filename}`,
    catalog = JSON.parse(await fs.readFile(path, "utf8"));
  for (const model of catalog.models) {
    const record = records.find((r) => r.id === model.id);
    if (!record) continue;
    if ("optimizedBytes" in model) model.optimizedBytes = record.bytes;
    else if ("bytes" in model) model.bytes = record.bytes;
  }
  await fs.writeFile(path, JSON.stringify(catalog, null, 2) + "\n");
}
console.log(
  "TOTAL",
  records.reduce((s, r) => s + r.beforeBytes, 0),
  "→",
  records.reduce((s, r) => s + r.bytes, 0),
);
