import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { CRUCE_TABLE } from "../../../packages/shared/cruce-station";

describe("Cruce timber furniture exports", () => {
  it("keeps the shared seats, actual wood material and bounded geometry", async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    const wood = await readFile(
      new URL("../public/assets/cruce/wood-grain-v2.webp", import.meta.url),
    );
    for (const [id, size, triangleLimit] of [
      [
        "Cruce_Table_Wood",
        [
          CRUCE_TABLE.halfWidth * 2,
          CRUCE_TABLE.surface,
          CRUCE_TABLE.halfWidth * 2,
        ],
        4000,
      ],
      [
        "Cruce_Bench_Wood",
        [
          CRUCE_TABLE.benchWidth,
          CRUCE_TABLE.seatHeight,
          CRUCE_TABLE.benchDepth,
        ],
        1600,
      ],
    ] as const) {
      const doc = await io.read(
        new URL(`../public/assets/optimized/${id}.glb`, import.meta.url)
          .pathname,
      );
      const bounds = getBounds(doc.getRoot().listScenes()[0]);
      size.forEach((v, j) =>
        expect(bounds.max[j] - bounds.min[j], `${id} axis${j}`).toBeCloseTo(
          v,
          4,
        ),
      );
      expect(bounds.min[1]).toBeCloseTo(0, 4);
      expect(Buffer.from(doc.getRoot().listTextures()[0].getImage()!)).toEqual(
        wood,
      );
      const primitives = doc
        .getRoot()
        .listMeshes()
        .flatMap((m) => m.listPrimitives());
      expect(primitives).toHaveLength(3);
      const triangles = primitives.reduce(
        (n, p) =>
          n +
          (p.getIndices()?.getCount() ??
            p.getAttribute("POSITION")!.getCount()) /
            3,
        0,
      );
      expect(triangles).toBeLessThan(triangleLimit);
      for (const p of primitives) {
        expect(p.getAttribute("TEXCOORD_0")!.getCount()).toBe(
          p.getAttribute("POSITION")!.getCount(),
        );
        expect(
          [...p.getAttribute("NORMAL")!.getArray()!].every(Number.isFinite),
        ).toBe(true);
      }
    }
  });
});
