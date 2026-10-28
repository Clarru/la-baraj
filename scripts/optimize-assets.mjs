import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  textureCompress,
  getBounds,
} from "@gltf-transform/functions";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
const base = "apps/web/public/assets";
const manifest = JSON.parse(
  await fs.readFile(`${base}/source-manifest.json`, "utf8"),
);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const assets = [];
await fs.mkdir(`${base}/optimized`, { recursive: true });
for (const item of manifest.models) {
  const doc = await io.read(
    `assets/source-models/${item.pack}/${item.id}.gltf`,
  );
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [512, 512],
    }),
  );
  const bounds = getBounds(doc.getRoot().getDefaultScene());
  const name = item.id + ".glb";
  await io.write(`${base}/optimized/${name}`, doc);
  const bytes = (await fs.stat(`${base}/optimized/${name}`)).size;
  const triangles = doc
    .getRoot()
    .listMeshes()
    .reduce(
      (sum, m) =>
        sum +
        m
          .listPrimitives()
          .reduce(
            (s, p) =>
              s +
              (p.getIndices()?.getCount() ??
                p.getAttribute("POSITION").getCount()) /
                3,
            0,
          ),
      0,
    );
  assets.push({
    ...item,
    url: `/assets/optimized/${name}`,
    optimizedBytes: bytes,
    triangles,
    bounds,
  });
  console.log(item.id, bytes, Math.round(triangles), JSON.stringify(bounds));
}
await fs.writeFile(
  `${base}/asset-catalog.json`,
  JSON.stringify({ ...manifest, models: assets }, null, 2),
);
console.log(
  "TOTAL OPTIMIZED",
  assets.reduce((s, a) => s + a.optimizedBytes, 0),
);
