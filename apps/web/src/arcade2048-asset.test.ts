import { it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Box3, Matrix4, Vector3 } from "three";
import { inWater, terrainHeight, roadDistance } from "./geography";
import {
  ARCADE_STATION as station,
  ARCADE_STATIONS,
} from "../../../packages/shared/arcade2048-station";
it("ships a small independently decoded GLB with live-screen UVs, moving nodes, and real PBR maps", async () => {
  await MeshoptDecoder.ready;
  const file = resolve(
    import.meta.dirname,
    "../public/assets/arcade2048/cabinet.glb",
  );
  const doc = await new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder })
    .read(file);
  expect(statSync(file).size).toBeLessThan(400000);
  const bounds = new Box3();
  let triangles = 0;
  for (const node of doc.getRoot().listNodes())
    for (const p of node.getMesh()?.listPrimitives() ?? []) {
      const position = p.getAttribute("POSITION")!,
        m = new Matrix4().fromArray(node.getWorldMatrix()),
        v: number[] = [];
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, v);
        expect(v.every(Number.isFinite)).toBe(true);
        bounds.expandByPoint(new Vector3(...v).applyMatrix4(m));
      }
      triangles += (p.getIndices()?.getCount() ?? position.getCount()) / 3;
    }
  const size = bounds.getSize(new Vector3());
  expect(size.x).toBeCloseTo(station.width, 2);
  expect(size.y).toBeCloseTo(station.height, 1);
  expect(size.z).toBeCloseTo(station.depth, 2);
  expect(triangles).toBeLessThan(10000);
  for (const name of ["Screen", "Joystick", "ButtonNew", "ButtonScores"])
    expect(
      doc
        .getRoot()
        .listNodes()
        .some((n) => n.getName() === name),
    ).toBe(true);
  const joystick = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === "Joystick")!;
  expect(joystick.getTranslation()[1]).toBeCloseTo(0.967, 5);
  expect(joystick.listChildren().some((n) => n.getMesh())).toBe(true);
  const screen = doc
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === "Screen")!,
    p = screen.getMesh()!.listPrimitives()[0],
    uv = p.getAttribute("TEXCOORD_0")!;
  expect(uv).toBeTruthy();
  const points = Array.from({ length: uv.getCount() }, (_, i) => {
    const a: number[] = [],
      b: number[] = [];
    uv.getElement(i, a);
    p.getAttribute("POSITION")!.getElement(i, b);
    return {
      v: a[1],
      y: new Vector3(...b).applyMatrix4(
        new Matrix4().fromArray(screen.getWorldMatrix()),
      ).y,
    };
  }).sort((a, b) => b.y - a.y);
  expect(points[0].v).toBeCloseTo(0, 3);
  expect(points.at(-1)!.v).toBeCloseTo(1, 3);
  const enamel = doc
    .getRoot()
    .listMaterials()
    .find((m) => m.getName() === "Forest enamel")!;
  expect(enamel.getBaseColorTexture()).toBeTruthy();
  expect(enamel.getNormalTexture()).toBeTruthy();
  expect(enamel.getMetallicRoughnessTexture()).toBeTruthy();
  expect(enamel.getMetallicFactor()).toBe(0);
  expect(
    doc
      .getRoot()
      .listMaterials()
      .some(
        (m) => m.getMetallicFactor() === 1 && m.getMetallicRoughnessTexture(),
      ),
  ).toBe(true);
  const optimization = JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        "../../../experiments/asset-skill-lab/arcade/optimization.json",
      ),
      "utf8",
    )
      .trim()
      .split("\n")
      .at(-1)!,
  );
  expect(optimization.meshoptLosslessVerified).toBe(true);
});
it("places the machine on dry land with a stable small footprint", () => {
  expect(inWater(station.x, station.z)).toBe(false);
  expect(roadDistance(station.x, station.z)).toBeGreaterThan(0.8);
  const heights = [
    [-0.38, -0.36],
    [0.38, -0.36],
    [-0.38, 0.36],
    [0.38, 0.36],
  ].map(([x, z]) => terrainHeight(station.x + x, station.z + z));
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.12);
});

it("keeps all three lakeside cabinets dry, stable, and clear of the existing table", () => {
  for (const s of ARCADE_STATIONS) {
    expect(inWater(s.x, s.z)).toBe(false);
    expect(roadDistance(s.x, s.z)).toBeGreaterThan(0.8);
    expect(Math.hypot(s.x + 5, s.z - 68.37531356447997)).toBeGreaterThan(4);
    const h = [
      [-0.38, -0.36],
      [0.38, -0.36],
      [-0.38, 0.36],
      [0.38, 0.36],
    ].map(([x, z]) => terrainHeight(s.x + x, s.z + z));
    expect(Math.max(...h) - Math.min(...h)).toBeLessThan(0.12);
  }
  for (let i = 1; i < 3; i++)
    expect(ARCADE_STATIONS[i].x - ARCADE_STATIONS[i - 1].x).toBeGreaterThan(
      1.5,
    );
});
