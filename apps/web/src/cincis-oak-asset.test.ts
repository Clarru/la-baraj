import { describe, expect, it } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import manifest from "../public/assets/impostors/manifest.json";
import * as THREE from "three";
import sharp from "sharp";

const file = fileURLToPath(new URL("../../../docs/art-direction/trees/cincis-oak-v3.glb", import.meta.url));

describe("experimental Cinciș oak export", () => {
  it("has outward-facing bark and masked, double-sided foliage", async () => {
    const doc = await new NodeIO().read(file);
    const materials = doc.getRoot().listMaterials();
    const bark = materials.find((item) => item.getName() === "Oak bark");
    const leaves = materials.find((item) => item.getName() === "Oak foliage cards");
    expect(bark?.getBaseColorTexture()?.getMimeType()).toBe("image/jpeg");
    expect(leaves?.getAlphaMode()).toBe("MASK");
    expect(leaves?.getDoubleSided()).toBe(true);
    expect(leaves?.getBaseColorTexture()?.getSize()).toEqual([512, 512]);
    const primitive = doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives()).find((p) => p.getMaterial() === bark)!;
    const indices = primitive.getIndices()!, positions = primitive.getAttribute("POSITION")!, normals = primitive.getAttribute("NORMAL")!;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    let outward = 0;
    for (let i = 0; i < indices.getCount(); i += 3) {
      const i0 = indices.getScalar(i), i1 = indices.getScalar(i + 1), i2 = indices.getScalar(i + 2);
      a.fromArray(positions.getElement(i0, [])); b.fromArray(positions.getElement(i1, [])); c.fromArray(positions.getElement(i2, [])); n.fromArray(normals.getElement(i0, []));
      if (b.sub(a).cross(c.sub(a)).dot(n) > 0) outward++;
    }
    // Reversing the authored triangle winding made the trunk disappear from outside.
    expect(outward / (indices.getCount() / 3)).toBeGreaterThan(0.95);
  });
  it("ships the reviewed model and its matched grounded impostor", async () => {
    const shippedModel = fileURLToPath(new URL("../public/assets/optimized/Cincis_Oak_1.glb", import.meta.url));
    const shippedImpostor = fileURLToPath(new URL("../public/assets/impostors/Cincis_Oak_1.png", import.meta.url));
    const reviewedImpostor = fileURLToPath(new URL("../../../docs/art-direction/trees/oak-v3-impostor.png", import.meta.url));
    expect(await readFile(shippedModel)).toEqual(await readFile(file));
    expect(await readFile(shippedImpostor)).toEqual(await readFile(reviewedImpostor));
    expect(manifest.Cincis_Oak_1.width).toBeCloseTo(7.6294384);
    expect(manifest.Cincis_Oak_1.height).toBeCloseTo(11.4441576);
  });
  it("bakes a transparent impostor with the tree grounded at the lower edge", async () => {
    const file = fileURLToPath(new URL("../../../docs/art-direction/trees/oak-v3-impostor.png", import.meta.url));
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([256, 384, 4]);
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(alphaAt(0, 0)).toBe(0);
    expect(Array.from({ length: info.width }, (_, x) => alphaAt(x, info.height - 1)).some((alpha) => alpha > 0)).toBe(true);
  });
});
