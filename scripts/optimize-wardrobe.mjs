/** Optimize rigged candidates and verify their exact canonical bind contract. */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress, getBounds } from "@gltf-transform/functions";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {validateWardrobeMaterial} from "./wardrobe-material-contracts.mjs";

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
async function pixelKey(texture) {
  const {data,info} = await sharp(texture.getImage()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return [info.width,info.height,crypto.createHash("sha256").update(data).digest("hex")].join(":");
}
const approvedTextures = new Map();
for (const texture of approved.getRoot().listTextures())
  approvedTextures.set(await pixelKey(texture), texture);
const approvedMaterials={};
for(const material of approved.getRoot().listMaterials()) {
  const hashes={};
  for(const [slot,texture] of [["map",material.getBaseColorTexture()],["normalMap",material.getNormalTexture()],
    ["roughnessMap",material.getMetallicRoughnessTexture()],["metalnessMap",material.getMetallicRoughnessTexture()],
    ["aoMap",material.getOcclusionTexture()]])
    if(texture?.getImage()) hashes[slot]=crypto.createHash("sha256").update(texture.getImage()).digest("hex");
  approvedMaterials[material.getName()]=hashes;
}
await fs.writeFile(path.join(root,"apps/web/src/wardrobe-approved-textures.json"),
  JSON.stringify(approvedMaterials,null,2)+"\n");
const arguments_ = process.argv.slice(2);
if (arguments_.length && arguments_[0] !== "--only") throw Error("Use --only followed by wardrobe IDs");
const selected = arguments_.length ? new Set(arguments_.slice(1)) : null;
if (selected && (!selected.size || [...selected].some(id => !/^[a-z][a-z0-9-]+$/.test(id))))
  throw Error("--only requires valid wardrobe IDs");
const filenames = (await fs.readdir(source)).filter(name => name.endsWith(".glb")).sort();
if (selected) for (const id of selected)
  if (!filenames.includes(id + ".glb")) throw Error("Missing wardrobe source: " + id);
const manifestPath = path.join(root, "docs/characters/wardrobe/candidates.json");
const records = selected
  ? JSON.parse(await fs.readFile(manifestPath,"utf8")).assets.filter(asset => !selected.has(asset.id))
  : [];
for (const filename of filenames.filter(name => !selected || selected.has(name.slice(0,-4)))) {
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
  let retainedApprovedTextures = 0;
  for (const texture of doc.getRoot().listTextures()) {
    const original = approvedTextures.get(await pixelKey(texture));
    if (!original) continue;
    // Blender stores an imported WebP as PNG. Reuse the exact approved encoded
    // texture when decoded pixels agree; don't inflate or recompress that map.
    const hash = crypto.createHash("sha256").update(original.getImage()).digest("hex");
    texture.setImage(original.getImage()).setMimeType(original.getMimeType()).setName("approved_"+hash);
    retainedApprovedTextures++;
  }
  // Narrow rib strips need less texture area than the full garment atlas.
  // Keep their material separate without adding two full-size fabric maps.
  for (const material of doc.getRoot().listMaterials()) {
    if (material.getName() !== "Wardrobe_Knit_Charcoal_Fitted_Rib") continue;
    material.getBaseColorTexture()?.setName("rib_albedo");
    material.getNormalTexture()?.setName("rib_normal");
  }
  await doc.transform(dedup(), prune(), textureCompress({
    encoder: sharp, targetFormat: "webp", resize: [256, 256],
    pattern: /^rib_/, slots: /^(?!normalTexture|metallicRoughnessTexture|occlusionTexture).*$/,
  }), textureCompress({
    encoder: sharp, targetFormat: "webp", resize: [256, 256], lossless: true,
    pattern: /^rib_/, slots: /^(normalTexture|metallicRoughnessTexture|occlusionTexture)$/,
  }), textureCompress({
    encoder: sharp, targetFormat: "webp", resize: [1024, 1024],
    pattern: /^(?!approved_|rib_)/,
    slots: /^(?!normalTexture|metallicRoughnessTexture|occlusionTexture).*$/,
  }), textureCompress({
    encoder: sharp, targetFormat: "webp", resize: [512, 512], lossless: true,
    pattern: /^(?!approved_|rib_)/,
    slots: /^(normalTexture|metallicRoughnessTexture|occlusionTexture)$/,
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
    if (filename === "top-weekend-knit.glb" && material.getName() === "Wardrobe_Knit_Charcoal") {
      material.setBaseColorFactor([0.065, 0.075, 0.085, 1]);
      material.setRoughnessFactor(0.88);
    }
    if (filename.startsWith("hat-") && material.getBaseColorTexture() &&
        !/^Wardrobe_Hat_(Cap_Navy|Beanie_Olive|Bucket_Olive)$/.test(material.getName())) {
      material.setBaseColorFactor(filename.includes("beanie")
        ? [0.12, 0.15, 0.14, 1] : [0.06, 0.08, 0.12, 1]);
    }
    if (filename.startsWith("bottom-trail-cargo") && material.getBaseColorTexture())
      material.setBaseColorFactor([0.17, 0.20, 0.12, 1]);
    if (filename.startsWith("bottom-weekend-shorts") && material.getName().includes("Twill"))
      material.setBaseColorFactor([0.7, 0.59, 0.41, 1]);
    if (filename === "top-trail-overshirt.glb" && material.getBaseColorTexture() && !material.getName().includes("_Fitted"))
      material.setBaseColorFactor([0.04, 0.075, 0.13, 1]);
    if (filename === "female-brunette-tailored.glb" && material.getName().includes("Black_Tailoring") && !material.getName().includes("_Fitted"))
      material.setBaseColorFactor([0.009, 0.012, 0.015, 1]);
    if (filename === "female-brunette-tailored.glb" && material.getName().includes("Female_Brunette"))
      material.setBaseColorFactor([0.045, 0.021, 0.011, 1]);
    if (filename === "shoes-trail-hikers.glb" && material.getName().includes("Hiking_Leather"))
      material.setBaseColorFactor([0.30, 0.19, 0.12, 1]);
    validateWardrobeMaterial(filename.replace(/\.glb$/,""),material.getName(),material.getBaseColorFactor());
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
    textures: doc.getRoot().listTextures().length, retainedApprovedTextures, joints: expected.size,
    bounds: getBounds(doc.getRoot().getDefaultScene()),
    sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
}
records.sort((a,b) => a.id.localeCompare(b.id));
const manifest = { stage: "optimized candidates; visual and deformation review required", assets: records };
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
