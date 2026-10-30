import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { NodeIO, type Document, type Node } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  type Clearcoat,
} from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import sharp from "sharp";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const file = (name: string) =>
  new URL(`../public/assets/optimized/${name}.glb`, import.meta.url).pathname;
const read = (name: string) => io.read(file(name));
const detailed = await read("Lake_Runabout");
const lod = await read("Lake_Runabout_LOD");

const triangles = (doc: Document) =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce(
      (sum, p) =>
        sum +
        (p.getIndices()?.getCount() ?? p.getAttribute("POSITION")!.getCount()) /
          3,
      0,
    );
const materialNames = (doc: Document) =>
  new Set(
    doc
      .getRoot()
      .listMaterials()
      .map((m) => m.getName()),
  );
const node = (doc: Document, name: string) => {
  const found = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === name);
  if (!found) throw new Error(`missing node ${name}`);
  return found;
};
const worldPosition = (n: Node) => n.getWorldMatrix().slice(12, 15);
const required = [
  "Varnish",
  "DeckPlanks",
  "Chrome",
  "Leather",
  "Glass",
  "Ivory",
  "BottomPaint",
  "BootStripe",
];

describe("runabout asset", () => {
  it("detailed runabout stays within the download and triangle budget", () => {
    expect(fs.statSync(file("Lake_Runabout")).size).toBeLessThanOrEqual(
      1_048_576,
    );
    const count = triangles(detailed);
    expect(count).toBeLessThanOrEqual(60_000);
    expect(count).toBeGreaterThanOrEqual(15_000);
  });

  it("LOD runabout is light and shares the look", () => {
    expect(triangles(lod)).toBeLessThanOrEqual(8_000);
    const full = materialNames(detailed);
    for (const name of required) expect(full).toContain(name);
    // The LOD drops the tufting buttons and the gauge glass.
    full.delete("Tufting");
    full.delete("GaugeGlass");
    expect([...materialNames(lod)].sort()).toEqual([...full].sort());
  });

  it("is a full-size runabout pointing +Z with the origin at the waterline pivot", () => {
    for (const doc of [detailed, lod]) {
      const { min, max } = getBounds(doc.getRoot().getDefaultScene()!);
      const length = max[2] - min[2];
      expect(length).toBeGreaterThan(6.1 - 0.2);
      expect(length).toBeLessThan(6.1 + 0.2);
      expect(max[0] - min[0]).toBeGreaterThan(2.2 - 0.15);
      expect(max[0] - min[0]).toBeLessThan(2.2 + 0.15);
      expect(min[1]).toBeGreaterThan(-0.55);
      expect(min[1]).toBeLessThan(-0.25);
      expect(Math.abs(max[2] - 0.6 * length)).toBeLessThan(0.15);
      expect(Math.abs(min[2] + 0.4 * length)).toBeLessThan(0.15);
    }
  });

  it("exposes the steering and seating nodes", () => {
    for (const doc of [detailed, lod]) {
      const wheel = node(doc, "SteeringWheel");
      const spin = node(doc, "WheelSpin");
      expect(spin.getParentNode()).toBe(wheel);
      const isUnder = (n: Node, ancestor: Node) => {
        for (let p = n.getParentNode(); p; p = p.getParentNode())
          if (p === ancestor) return true;
        return false;
      };
      const left = node(doc, "Grip_L"),
        right = node(doc, "Grip_R");
      expect(isUnder(left, spin)).toBe(true);
      expect(isUnder(right, spin)).toBe(true);
      expect(worldPosition(left)[0]).toBeGreaterThan(worldPosition(right)[0]);
      const driver = worldPosition(node(doc, "DriverSeat"));
      expect(driver[0]).toBeLessThan(-0.2);
      expect(Math.abs(driver[2])).toBeLessThanOrEqual(1.2);
      const seats = [0, 1, 2, 3, 4, 5].map((i) =>
        worldPosition(node(doc, `Seat_${i}`))
          .map((v) => v.toFixed(2))
          .join(","),
      );
      expect(new Set(seats).size).toBe(6);
    }
  });

  it("varnish keeps its clearcoat", () => {
    for (const doc of [detailed, lod]) {
      const materials = doc.getRoot().listMaterials();
      const varnish = materials.find((m) => m.getName() === "Varnish")!;
      const coat = varnish.getExtension<Clearcoat>("KHR_materials_clearcoat");
      expect(coat).toBeTruthy();
      expect(coat!.getClearcoatFactor()).toBeGreaterThanOrEqual(0.5);
      const chrome = materials.find((m) => m.getName() === "Chrome")!;
      expect(chrome.getMetallicFactor()).toBeGreaterThanOrEqual(0.9);
      expect(chrome.getRoughnessFactor()).toBeLessThanOrEqual(0.2);
    }
  });

  it("textures stay within 2048 px", async () => {
    for (const doc of [detailed, lod]) {
      const textures = doc.getRoot().listTextures();
      expect(textures.length).toBeGreaterThan(0);
      for (const texture of textures) {
        expect(texture.getMimeType()).toBe("image/webp");
        const meta = await sharp(Buffer.from(texture.getImage()!)).metadata();
        expect(meta.format).toBe("webp");
        expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(2048);
      }
    }
  });
});
