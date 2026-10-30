import { MeshoptDecoder } from "meshoptimizer";
import { NodeIO } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  KHRMaterialsUnlit,
  KHRTextureTransform,
} from "@gltf-transform/extensions";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const folder = import.meta.dirname,
  io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
await MeshoptDecoder.ready;
const preview = process.argv[2] === "preview";
const doc = await io.read(
  resolve(folder, preview ? "cabinet.glb" : "Arcade2048-raw.glb"),
);
const mats = doc.getRoot().listMaterials();
if (!preview) {
  const enamel = mats.find((m) => m.getName() === "Forest enamel"),
    iron = mats.find((m) => m.getName() === "LaBaraj iron");
  // Blender's MixRGB multiply is not exported as a glTF factor. Preserve the authored tint explicitly.
  enamel
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0)
    .setMetallicRoughnessTexture(iron.getMetallicRoughnessTexture());
  const paint = doc
    .createTexture("Forest painted timber")
    .setImage(await readFile(resolve(folder, "paint-512.png")))
    .setMimeType("image/png");
  enamel.setBaseColorTexture(paint).setNormalScale(0.15);
  enamel
    .getBaseColorTextureInfo()
    .setExtension(
      "KHR_texture_transform",
      doc
        .createExtension(KHRTextureTransform)
        .createTransform()
        .setScale([4, 1]),
    );
  mats.find((m) => m.getName() === "Live display").setBaseColorTexture(null);
} else {
  const mat = mats.find((m) => m.getName() === "Live display");
  const t = doc
    .createTexture("QA actual canvas screen")
    .setImage(await readFile(resolve(folder, "screen-preview.png")))
    .setMimeType("image/png");
  mat
    .setBaseColorFactor([1, 1, 1, 1])
    .setBaseColorTexture(t)
    .setExtension(
      "KHR_materials_unlit",
      doc.createExtension(KHRMaterialsUnlit).createUnlit(),
    );
}
// Re-import QA consumes the decoded runtime geometry; Blender does not need the codec.
if (preview)
  doc
    .getRoot()
    .listExtensionsUsed()
    .find((e) => e.extensionName === "EXT_meshopt_compression")
    ?.dispose();
await io.write(
  resolve(folder, preview ? "cabinet-display-qa.glb" : "Arcade2048-pbr.glb"),
  doc,
);
