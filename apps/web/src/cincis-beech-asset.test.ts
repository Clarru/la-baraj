import { expect, it } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import manifest from "../public/assets/impostors/manifest.json";

it("ships the beech detail meshes with shared materials and a grounded model-derived sprite", async () => {
  const source = fileURLToPath(
    new URL(
      "../../../docs/art-direction/trees/cincis-beech-packed-lod-study.glb",
      import.meta.url,
    ),
  );
  const model = fileURLToPath(
    new URL("../public/assets/optimized/Cincis_Beech_1.glb", import.meta.url),
  );
  const sprite = fileURLToPath(
    new URL("../public/assets/impostors/Cincis_Beech_1.png", import.meta.url),
  );
  const reviewedSprite = fileURLToPath(
    new URL(
      "../../../docs/art-direction/trees/beech-impostor-study.png",
      import.meta.url,
    ),
  );
  expect(await readFile(model)).toEqual(await readFile(source));
  expect(await readFile(sprite)).toEqual(await readFile(reviewedSprite));
  const doc = await new NodeIO().read(model);
  const roots = doc.getRoot().listScenes()[0].listChildren();
  expect(roots.map((node) => node.getName()).sort()).toEqual([
    "Beech_Mid",
    "Beech_Near",
  ]);
  expect(doc.getRoot().listTextures()).toHaveLength(2);
  const materials = roots.map(
    (root) =>
      new Set(
        root
          .listChildren()
          .flatMap((node) => node.getMesh()?.listPrimitives() ?? [])
          .map((primitive) => primitive.getMaterial()),
      ),
  );
  expect(materials[0]).toEqual(materials[1]);
  expect(manifest.Cincis_Beech_1.width).toBeCloseTo(7.5511546);
  expect(manifest.Cincis_Beech_1.height).toBeCloseTo(11.3267319);
  const { data, info } = await sharp(sprite)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual([256, 384]);
  expect(data[3]).toBe(0);
  expect(
    Array.from(
      { length: info.width },
      (_, x) => data[((info.height - 1) * info.width + x) * 4 + 3],
    ).some((alpha) => alpha > 0),
  ).toBe(true);
});
