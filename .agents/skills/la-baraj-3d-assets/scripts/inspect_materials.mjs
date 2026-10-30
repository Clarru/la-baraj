/** Extract licensed-reference maps and material settings for causal surface analysis. */
import fs from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const [model, output] = process.argv.slice(2);
if (!model || !output)
  throw new Error("Usage: inspect_materials.mjs model.glb output-directory");
await fs.mkdir(output, { recursive: true });
await MeshoptDecoder.ready;
const doc = await new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder })
  .read(model);
const records = [];
for (const mat of doc.getRoot().listMaterials()) {
  const record = {
    name: mat.getName(),
    baseColorFactor: mat.getBaseColorFactor(),
    metallicFactor: mat.getMetallicFactor(),
    roughnessFactor: mat.getRoughnessFactor(),
    normalScale: mat.getNormalScale(),
    occlusionStrength: mat.getOcclusionStrength(),
    textures: {},
  };
  for (const [role, texture] of [
    ["baseColor", mat.getBaseColorTexture()],
    ["normal", mat.getNormalTexture()],
    ["metallicRoughness", mat.getMetallicRoughnessTexture()],
    ["occlusion", mat.getOcclusionTexture()],
  ])
    if (texture) {
      const filename = `${mat.getName()}-${role}.${texture.getMimeType().split("/")[1]}`;
      await fs.writeFile(path.join(output, filename), texture.getImage());
      record.textures[role] = {
        name: texture.getName(),
        size: texture.getSize(),
        filename,
      };
    }
  records.push(record);
}
await fs.writeFile(
  path.join(output, "materials.json"),
  JSON.stringify(records, null, 2) + "\n",
);
console.log(JSON.stringify(records));
