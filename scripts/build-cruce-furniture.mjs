/** Original Cruce timber joinery. Node24, metres, Y-up, ground origin.
 * Code-native editable authority; ImageGen albedo has per-beam longitudinal UVs.
 * Keeps the existing felt/seat contract. Does not modify neighboring furniture.
 */
import { NodeIO } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  EXTMeshoptCompression,
} from "@gltf-transform/extensions";
import { MeshoptEncoder } from "meshoptimizer";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CylinderGeometry, Matrix4, Euler, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const textureBytes = await readFile(
  "apps/web/public/assets/cruce/wood-grain-v2.webp",
);
const records = [];
for (const spec of [
  { id: "Cruce_Table_Wood", size: [1.6, 0.82, 1.6] },
  { id: "Cruce_Bench_Wood", size: [1.12, 0.47, 0.44] },
]) {
  const doc = await io.readJSON({
    json: { asset: { version: "2.0" }, scenes: [{ nodes: [] }], scene: 0 },
    resources: {},
  });
  const buffer = doc.createBuffer();
  const texture = doc
    .createTexture("ImageGen longitudinal chestnut grain")
    .setImage(textureBytes)
    .setMimeType("image/webp");
  const wood = doc
    .createMaterial("Oiled chestnut timber")
    .setBaseColorTexture(texture)
    .setBaseColorFactor([0.78, 0.73, 0.65, 1])
    .setRoughnessFactor(0.8)
    .setMetallicFactor(0);
  wood.getBaseColorTextureInfo().setWrapS(10497).setWrapT(10497);
  const dark = doc
    .createMaterial("Chestnut structural timber")
    .setBaseColorTexture(texture)
    .setBaseColorFactor([0.57, 0.52, 0.46, 1])
    .setRoughnessFactor(0.9)
    .setMetallicFactor(0);
  dark.getBaseColorTextureInfo().setWrapS(10497).setWrapT(10497);
  const iron = doc
    .createMaterial("Dark iron coach bolts")
    .setBaseColorFactor([0.12, 0.14, 0.13, 1])
    .setRoughnessFactor(0.65)
    .setMetallicFactor(0.4);
  const groups = [[], [], []];
  let serial = 0;
  function beam(
    size,
    position,
    axis = "x",
    structural = false,
    rotation = [0, 0, 0],
  ) {
    const geometry = new RoundedBoxGeometry(
      ...size,
      1,
      Math.min(0.009, ...size.map((v) => v / 5)),
    );
    const pos = geometry.attributes.position,
      normal = geometry.attributes.normal,
      uv = geometry.attributes.uv;
    const long = { x: 0, y: 1, z: 2 }[axis],
      seed = serial++;
    for (let i = 0; i < pos.count; i++) {
      const p = [pos.getX(i), pos.getY(i), pos.getZ(i)],
        n = [normal.getX(i), normal.getY(i), normal.getZ(i)];
      const face = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
      // Grain follows the timber's long axis on its long faces; end faces show a cross section.
      const uAxis = face === long ? (long + 1) % 3 : long;
      const vAxis =
        [0, 1, 2].find((a) => a !== uAxis && a !== face) ?? (long + 2) % 3;
      uv.setXY(
        i,
        p[uAxis] / 1.1 + ((seed * 0.173) % 1),
        p[vAxis] / 0.32 + ((seed * 0.271) % 1),
      );
    }
    geometry.applyMatrix4(
      new Matrix4().compose(
        new Vector3(...position),
        new Quaternion().setFromEuler(new Euler(...rotation)),
        new Vector3(1, 1, 1),
      ),
    );
    groups[structural ? 1 : 0].push(geometry);
  }
  function bolt(x, y, z) {
    const g = new CylinderGeometry(0.012, 0.012, 0.006, 8);
    g.translate(x, y - 0.003, z);
    groups[2].push(g);
  }
  if (spec.id === "Cruce_Table_Wood") {
    // Four miter-like border rails enclose the retained 1.28m green felt.
    for (const z of [-0.72, 0.72]) beam([1.6, 0.075, 0.16], [0, 0.7795, z]);
    for (const x of [-0.72, 0.72])
      beam([0.16, 0.075, 1.276], [x, 0.7795, 0], "z");
    for (let i = 0; i < 8; i++)
      beam([1.278, 0.055, 0.157], [0, 0.7895, -0.56 + i * 0.16]);
    for (const x of [-0.64, 0.64])
      for (const z of [-0.64, 0.64]) {
        beam([0.115, 0.737, 0.115], [x, 0.3685, z], "y", true);
        beam([0.15, 0.065, 0.15], [x, 0.0325, z], "y", true);
        bolt(x * 1.125, 0.82, z * 1.125);
        for (const [dx, dz] of [
          [Math.sign(x), 0],
          [0, Math.sign(z)],
        ]) {
          beam(
            [0.065, 0.3, 0.065],
            [x - dx * 0.085, 0.59, z - dz * 0.085],
            "y",
            true,
            [dz * 0.65, 0, -dx * 0.65],
          );
        }
      }
    for (const z of [-0.64, 0.64])
      beam([1.36, 0.14, 0.065], [0, 0.66, z], "x", true);
    for (const x of [-0.64, 0.64])
      beam([0.065, 0.14, 1.36], [x, 0.66, 0], "z", true);
  } else {
    for (const z of [-0.112, 0.112]) beam([1.12, 0.067, 0.216], [0, 0.4335, z]);
    for (const x of [-0.37, 0.37]) {
      beam([0.14, 0.065, 0.42], [x, 0.0325, 0], "z", true);
      for (const z of [-0.13, 0.13])
        beam([0.09, 0.337, 0.09], [x, 0.2305, z], "y", true, [
          (z < 0 ? 1 : -1) * 0.12,
          0,
          0,
        ]);
      beam([0.115, 0.065, 0.4], [x, 0.3675, 0], "z", true);
      for (const z of [-0.14, 0.14]) bolt(x, 0.47, z);
    }
    beam([0.85, 0.08, 0.075], [0, 0.17, 0], "x", true);
  }
  let triangles = 0;
  const mesh = doc.createMesh(spec.id);
  for (const [i, geometries] of groups.entries()) {
    if (!geometries.length) continue;
    // Both primitive types are normalized to indexed position/normal/UV groups.
    const merged = mergeGeometries(
      geometries.map((g) => (g.index ? g.toNonIndexed() : g)),
    );
    const primitive = doc.createPrimitive().setMaterial([wood, dark, iron][i]);
    for (const [semantic, name] of [
      ["POSITION", "position"],
      ["NORMAL", "normal"],
      ["TEXCOORD_0", "uv"],
    ]) {
      primitive.setAttribute(
        semantic,
        doc
          .createAccessor()
          .setType(name === "uv" ? "VEC2" : "VEC3")
          .setArray(new Float32Array(merged.attributes[name].array))
          .setBuffer(buffer),
      );
    }
    triangles += merged.attributes.position.count / 3;
    mesh.addPrimitive(primitive);
    merged.dispose();
    geometries.forEach((g) => g.dispose());
  }
  doc.getRoot().listScenes()[0].addChild(doc.createNode(spec.id).setMesh(mesh));
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const path = `apps/web/public/assets/optimized/${spec.id}.glb`;
  await io.write(path, doc);
  records.push({
    ...spec,
    triangles,
    bytes: (await readFile(path)).length,
    materials: 3,
    textureSha256: createHash("sha256").update(textureBytes).digest("hex"),
  });
}
await writeFile(
  "docs/art-direction/cruce/furniture.json",
  JSON.stringify(
    {
      source: "scripts/build-cruce-furniture.mjs",
      geometry:
        "Original beveled plank and braced timber furniture; existing world furniture is style reference only.",
      texture: "Built-in ImageGen; wood-prompt.json; per-beam grain UVs.",
      felt: "Existing felt.webp and 1.28m surface unchanged.",
      models: records,
    },
    null,
    2,
  ) + "\n",
);
console.log(records);
