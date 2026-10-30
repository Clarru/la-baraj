import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  quantize,
  textureCompress,
  getBounds,
} from "@gltf-transform/functions";
import sharp from "sharp";
import fs from "node:fs/promises";

// Optimizes the Blender runabout exports (scripts/build-runabout.py) for the game.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const records = [];
for (const id of ["Lake_Runabout", "Lake_Runabout_LOD"]) {
  const doc = await io.read(`assets/house-source/${id}.glb`);
  for (const material of doc.getRoot().listMaterials()) {
    const name = material.getName();
    if (name === "Glass") material.setAlphaMode("BLEND").setDoubleSided(true);
    if (name === "GaugeGlass") material.setAlphaMode("BLEND");
    if (name === "Pennant") material.setDoubleSided(true);
  }
  await doc.transform(
    dedup(),
    // Keep the empty contract nodes (grips, seats), which prune would drop as empty leaves.
    prune({ keepLeaves: true }),
    // KHR_mesh_quantization: three.js reads it natively, no decoder needed.
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [1024, 1024],
      quality: 90,
    }),
  );
  const out = `apps/web/public/assets/optimized/${id}.glb`;
  await io.write(out, doc);
  const triangles = doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce(
      (sum, p) =>
        sum +
        (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) /
          3,
      0,
    );
  records.push({
    id,
    bytes: (await fs.stat(out)).size,
    triangles,
    bounds: getBounds(doc.getRoot().getDefaultScene()),
    source:
      "Original Blender geometry built by scripts/build-runabout.py after docs/art-direction/runabout/ concept; procedural textures generated in the same script; no third-party mesh",
  });
}
await fs.writeFile(
  "apps/web/public/assets/runabout-library.json",
  JSON.stringify({ models: records }, null, 2) + "\n",
);
console.log(records);
