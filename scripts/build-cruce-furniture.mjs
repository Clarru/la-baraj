/** Derive the Cruce furniture from the retained Quaternius world set.
 * Source GLBs, texture bytes and licenses remain authoritative; no generated texture.
 * Run from repository root with Node 24. Runtime units: metres, Y up, floor at zero.
 */
import { NodeIO } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  EXTMeshoptCompression,
} from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });
const root = "apps/web/public/assets/optimized";
const records = [];
for (const spec of [
  { source: "Table_Large", id: "Cruce_Table", size: [1.6, 0.82, 1.6] },
  { source: "Bench", id: "Cruce_Bench", size: [1.12, 0.47, 0.44] },
]) {
  const path = `${root}/${spec.source}.glb`,
    bytes = await readFile(path);
  const doc = await io.read(path);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute("POSITION");
      const lo = a.getMin([]),
        hi = a.getMax([]);
      for (let j = 0; j < 3; j++) {
        min[j] = Math.min(min[j], lo[j]);
        max[j] = Math.max(max[j], hi[j]);
      }
    }
  const scale = spec.size.map((v, j) => v / (max[j] - min[j]));
  const offset = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute("POSITION"),
        ar = a.getArray();
      for (let i = 0; i < ar.length; i++)
        ar[i] = (ar[i] - offset[i % 3]) * scale[i % 3];
      // Transform normal vectors by the inverse transpose of the resized axes.
      const normals = p.getAttribute("NORMAL")?.getArray();
      if (normals)
        for (let i = 0; i < normals.length; i += 3) {
          const v = [
            normals[i] / scale[0],
            normals[i + 1] / scale[1],
            normals[i + 2] / scale[2],
          ];
          const length = Math.hypot(...v);
          for (let j = 0; j < 3; j++) normals[i + j] = v[j] / length;
        }
    }
  doc
    .getRoot()
    .listNodes()
    .forEach((n) => n.setName(spec.id));
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const out = `${root}/${spec.id}.glb`;
  await io.write(out, doc);
  records.push({
    ...spec,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: (await readFile(out)).length,
    texturePolicy: "Original source textures and UVs retained byte for byte.",
  });
}
await writeFile(
  "docs/art-direction/cruce/furniture.json",
  JSON.stringify(
    {
      source: "scripts/build-cruce-furniture.mjs",
      reference:
        "Existing Table_Large and Bench beside Cruce; user screenshot 2026-10-30.",
      license:
        "Same as source furniture; see apps/web/public/assets/CREDITS.md and source-manifest.json.",
      models: records,
    },
    null,
    2,
  ) + "\n",
);
console.log(records);
