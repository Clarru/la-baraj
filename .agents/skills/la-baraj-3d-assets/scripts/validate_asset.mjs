/** Validate actual GLB resources and reference-relative budgets. Does not judge visual quality. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const [
  referencePath,
  candidatePath,
  modelPath,
  reportPath,
  surfaceReferencePath,
] = process.argv.slice(2);
if (!referencePath || !candidatePath || !modelPath)
  throw new Error(
    "Usage: validate_asset.mjs reference-metrics.json candidate-metrics.json candidate.glb [report.json]",
  );
const reference = JSON.parse(await fs.readFile(referencePath, "utf8"));
const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8"));
await MeshoptDecoder.ready;
const document = await new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder })
  .read(modelPath);
const root = document.getRoot();
const errors = [];
let surfaceRequirements = null;
if (surfaceReferencePath) {
  const originalMaterials = JSON.parse(
    await fs.readFile(surfaceReferencePath, "utf8"),
  );
  surfaceRequirements = {
    normal: originalMaterials.every((m) => !!m.textures.normal),
    metallicRoughness: originalMaterials.every(
      (m) => !!m.textures.metallicRoughness,
    ),
  };
  if (
    surfaceRequirements.normal &&
    !root.listMaterials().every((m) => !!m.getNormalTexture())
  )
    errors.push("Reference normal-map layer missing");
  if (
    surfaceRequirements.metallicRoughness &&
    !root.listMaterials().every((m) => !!m.getMetallicRoughnessTexture())
  )
    errors.push("Reference metallic/roughness layer missing");
}
let primitives = 0,
  triangles = 0;
for (const mesh of root.listMeshes())
  for (const primitive of mesh.listPrimitives()) {
    primitives++;
    const position = primitive.getAttribute("POSITION");
    assert(position, "Mesh is missing POSITION");
    for (const semantic of primitive.listSemantics()) {
      const attribute = primitive.getAttribute(semantic);
      assert.equal(
        attribute.getCount(),
        position.getCount(),
        `Attribute length: ${semantic}`,
      );
      assert(
        attribute.getArray().every(Number.isFinite),
        `Non-finite ${semantic}`,
      );
    }
    const indices = primitive.getIndices();
    const count = indices?.getCount() ?? position.getCount();
    assert.equal(count % 3, 0, "Non-triangular index buffer");
    assert(
      !indices ||
        indices.getArray().every((i) => i >= 0 && i < position.getCount()),
      "Out-of-range index",
    );
    triangles += count / 3;
  }
assert.equal(
  triangles,
  candidate.triangles,
  "GLB triangles differ from Blender report",
);
const dimensionErrors = candidate.blender_dimensions.map((v, i) =>
  Math.abs(v / reference.blender_dimensions[i] - 1),
);
if (Math.max(...dimensionErrors) > 0.01)
  errors.push("Dimensions differ by more than 1%");
if (triangles > reference.triangles) errors.push("Triangle budget exceeded");
if (candidate.glb_bytes > reference.glb_bytes)
  errors.push("GLB byte budget exceeded");
if (primitives > reference.mesh_material_slots)
  errors.push("Primitive/draw-group budget exceeded");
const textures = root.listTextures().map((texture) => ({
  name: texture.getName(),
  size: texture.getSize(),
  mime: texture.getMimeType(),
  bytes: texture.getImage().byteLength,
  sha256: createHash("sha256").update(texture.getImage()).digest("hex"),
}));
const referenceTextureEdge = Math.max(
  1,
  ...reference.images.flatMap((image) => [image.width, image.height]),
);
assert(
  textures.every((t) =>
    t.size.every((d) => d > 0 && d <= referenceTextureEdge),
  ),
  "Invalid texture or texture larger than reference",
);
const report = {
  technical_pass: errors.length === 0,
  errors,
  triangles,
  reference_triangles: reference.triangles,
  glb_bytes: candidate.glb_bytes,
  reference_glb_bytes: reference.glb_bytes,
  primitives,
  material_count: root.listMaterials().length,
  surfaceRequirements,
  materials: root
    .listMaterials()
    .map((material) => ({
      name: material.getName(),
      metallicFactor: material.getMetallicFactor(),
      roughnessFactor: material.getRoughnessFactor(),
      normalScale: material.getNormalScale(),
      normalMap: !!material.getNormalTexture(),
      metallicRoughnessMap: !!material.getMetallicRoughnessTexture(),
    })),
  textures,
  dimension_error_fraction: dimensionErrors,
  visual_acceptance:
    "Separate manual comparison required; technical pass is not a 1:1 match or runtime performance claim",
};
if (reportPath)
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
process.exitCode = errors.length ? 1 : 0;
