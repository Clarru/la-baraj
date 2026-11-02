/** Optimize rigged candidates and verify their exact canonical bind contract. */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress, getBounds } from "@gltf-transform/functions";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "assets/source-models/wardrobe/build");
const output = path.join(root, "assets/source-models/wardrobe/optimized");
await fs.mkdir(output, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const approved = await io.read(path.join(root, "apps/web/public/assets/optimized/Lakeside_Man.glb"));
const reference = approved.getRoot().listSkins()[0];
function bindings(skin) {
  const matrices = skin.getInverseBindMatrices()?.getArray();
  if (!matrices) throw Error("Missing inverse bind matrices");
  return new Map(skin.listJoints().map((node, index) =>
    [node.getName(), [...matrices.slice(index * 16, index * 16 + 16)]]));
}
const expected = bindings(reference);
const records = [];
for (const filename of (await fs.readdir(source)).filter((name) => name.endsWith(".glb")).sort()) {
  const doc = await io.read(path.join(source, filename));
  if (doc.getRoot().listAnimations().length) throw Error("Garment candidates must not duplicate animation payloads");
  for (const skin of doc.getRoot().listSkins()) {
    const actual = bindings(skin);
    if (actual.size !== expected.size) throw Error(`${filename}: canonical joint count changed`);
    for (const [name, matrix] of expected) {
      const other = actual.get(name);
      if (!other || matrix.some((value, index) => Math.abs(value - other[index]) > 0.0001))
        throw Error(`${filename}: bind mismatch at ${name}`);
    }
  }
  await doc.transform(dedup(), prune(), textureCompress({
    encoder: sharp, targetFormat: "webp", resize: [1024, 1024],
  }));
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      triangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION").getCount()) / 3;
      if (!primitive.getAttribute("JOINTS_0") || !primitive.getAttribute("WEIGHTS_0"))
        throw Error(`${filename}: unbound wardrobe primitive`);
    }
  for (const material of doc.getRoot().listMaterials()) {
    if (filename.startsWith("hair-")) {
      // Publisher hair maps are neutral masks intended for a colour factor.
      // Preserve their normal detail and match the approved brunette baseline.
      material.setName("Wardrobe_Hair");
      material.setBaseColorFactor([0.035, 0.022, 0.016, 1]);
    }
    if (filename === "top-weekend-knit.glb") {
      material.setBaseColorFactor([0.065, 0.075, 0.085, 1]);
      material.setRoughnessFactor(0.88);
    }
    if (filename.startsWith("hat-") && material.getBaseColorTexture()) {
      material.setBaseColorFactor(filename.includes("beanie")
        ? [0.12, 0.15, 0.14, 1] : [0.06, 0.08, 0.12, 1]);
    }
    const hashes = {};
    for (const [slot, texture] of [
      ["map", material.getBaseColorTexture()], ["normalMap", material.getNormalTexture()],
      ["roughnessMap", material.getMetallicRoughnessTexture()],
      ["metalnessMap", material.getMetallicRoughnessTexture()], ["aoMap", material.getOcclusionTexture()],
    ]) if (texture?.getImage())
      hashes[slot] = crypto.createHash("sha256").update(texture.getImage()).digest("hex");
    material.setExtras({ ...material.getExtras(), wardrobeTextureHashes: hashes });
  }
  const target = path.join(output, filename);
  await io.write(target, doc);
  const bytes = await fs.readFile(target);
  records.push({ id: filename.replace(/\.glb$/, ""), candidate: path.relative(root, target),
    bytes: bytes.length, triangles, meshes: doc.getRoot().listMeshes().length,
    textures: doc.getRoot().listTextures().length, joints: expected.size,
    bounds: getBounds(doc.getRoot().getDefaultScene()),
    sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
}
const manifest = { stage: "optimized candidates; visual and deformation review required", assets: records };
await fs.writeFile(path.join(root, "docs/characters/wardrobe/candidates.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
