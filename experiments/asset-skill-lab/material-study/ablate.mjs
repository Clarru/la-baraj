import fs from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const mode of [
  "no-normal",
  "constant-reflection",
  "flat-base-color",
  "old-flat-material",
]) {
  const doc = await io.read(
    "experiments/asset-skill-lab/references/lantern-original.glb",
  );
  for (const material of doc.getRoot().listMaterials()) {
    if (mode === "no-normal" || mode === "old-flat-material")
      material.setNormalTexture(null);
    if (mode === "constant-reflection")
      material
        .setMetallicRoughnessTexture(null)
        .setMetallicFactor(0.96)
        .setRoughnessFactor(0.58);
    if (mode === "flat-base-color")
      material
        .setBaseColorTexture(null)
        .setBaseColorFactor([0.205, 0.205, 0.22, 1]);
    if (mode === "old-flat-material")
      material
        .setMetallicRoughnessTexture(null)
        .setMetallicFactor(0.05)
        .setRoughnessFactor(0.78);
  }
  await fs.mkdir(
    `experiments/asset-skill-lab/material-study/ablation/${mode}`,
    { recursive: true },
  );
  await io.write(
    `experiments/asset-skill-lab/material-study/ablation/${mode}/lantern.glb`,
    doc,
  );
}
