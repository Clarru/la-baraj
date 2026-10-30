import { describe, expect, it } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { CRUCE_TABLE } from "../../../packages/shared/cruce-station";

describe("Cruce furniture exports", () => {
  it("fits the shared seat contract and retains the neighboring furniture's real textures", async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    for (const [id, source, size] of [
      [
        "Cruce_Table",
        "Table_Large",
        [
          CRUCE_TABLE.halfWidth * 2,
          CRUCE_TABLE.surface,
          CRUCE_TABLE.halfWidth * 2,
        ],
      ],
      [
        "Cruce_Bench",
        "Bench",
        [
          CRUCE_TABLE.benchWidth,
          CRUCE_TABLE.seatHeight,
          CRUCE_TABLE.benchDepth,
        ],
      ],
    ] as const) {
      const load = (name: string) =>
        io.read(
          new URL(`../public/assets/optimized/${name}.glb`, import.meta.url)
            .pathname,
        );
      const [derived, original] = await Promise.all([load(id), load(source)]);
      const bounds = getBounds(derived.getRoot().listScenes()[0]);
      size.forEach((v, j) =>
        expect(bounds.max[j] - bounds.min[j], `${id} axis ${j}`).toBeCloseTo(
          v,
          5,
        ),
      );
      expect(bounds.min[1]).toBeCloseTo(0, 5);
      const textures = derived.getRoot().listTextures(),
        originals = original.getRoot().listTextures();
      expect(textures.length).toBe(originals.length);
      textures.forEach((t, i) =>
        expect(t.getImage()).toEqual(originals[i].getImage()),
      );
      const triangles = (doc: typeof original) =>
        doc
          .getRoot()
          .listMeshes()
          .flatMap((m) => m.listPrimitives())
          .reduce((n, p) => n + p.getIndices()!.getCount() / 3, 0);
      expect(triangles(derived)).toBe(triangles(original));
    }
  });
});
