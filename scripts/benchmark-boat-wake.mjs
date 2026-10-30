/** Node24 math-only wake layout benchmark. GPU/upload/frame costs are not measured. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { build } from "esbuild";
const folder = path.resolve(".impeccable/review/wake-benchmark");
await fs.mkdir(folder, { recursive: true });
const file = path.join(folder, "wake.cjs");
await build({
  entryPoints: ["apps/web/src/boat-wake-trail.ts"],
  outfile: file,
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  logLevel: "silent",
});
const w = createRequire(import.meta.url)(file);
const make = () => {
  const trail = w.createWakeTrail();
  for (let i = 0; i < 24; i++)
    w.pushWakeSample(trail, Math.sin(i * 0.05) * 8, i * 0.8, i * 0.15, 4.2, 1);
  return {
    trail,
    positions: new Float32Array(w.WAKE_VERTEX_COUNT * 3),
    aux: new Float32Array(w.WAKE_VERTEX_COUNT * 3),
    bounds: new Float32Array(3),
  };
};
function measure(count) {
  const items = Array.from({ length: count }, make);
  const step = () => {
    for (const x of items)
      w.layoutWakeRibbon(x.trail, 3.45, 0.08, x.positions, x.aux, x.bounds);
  };
  for (let i = 0; i < 500; i++) step();
  const trials = [];
  for (let t = 0; t < 5; t++) {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) step();
    trials.push(((performance.now() - start) * 1000) / 1000);
  }
  return {
    boats: count,
    unit: "microseconds per layout of all boats",
    median: [...trials].sort((a, b) => a - b)[2],
    trials,
  };
}
const report = {
  date: new Date().toISOString(),
  node: process.version,
  machine: os.cpus()[0]?.model,
  scope:
    "Actual numerical ribbon layout only; no Three renderer, GPU upload, reflection, or full frame cost. Allocation is fixed and re-used.",
  samples: w.WAKE_TRAIL_SAMPLES,
  verticesPerBoat: w.WAKE_VERTEX_COUNT,
  drawsPerBoat: 2,
  typedArrayBytesPerBoat:
    48 * 5 * 4 +
    w.WAKE_VERTEX_COUNT * 3 * 4 * 2 +
    w.wakeRibbonIndex().byteLength,
  results: [1, 10, 50].map(measure),
};
await fs.mkdir("docs/boats/results", { recursive: true });
await fs.writeFile(
  "docs/boats/results/wake-layout-review-2026-10-30.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
