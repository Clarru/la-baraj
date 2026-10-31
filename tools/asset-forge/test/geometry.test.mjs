import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Vector3 } from "three";
import { worldTriangles, coplanarOverlaps } from "../geometry.mjs";
import { TOOL } from "../core.mjs";

const face = (points) => ({
  points: points.map((p) => new Vector3(...p)),
  node: "fixture",
  material: "test",
  triangle: 0,
});
const triangle = (z = 0) =>
  face([
    [0, 0, z],
    [1, 0, z],
    [0, 1, z],
  ]);

test("exposed co-facing duplicate surfaces produce an overlap location and physical area", () => {
  const r = coplanarOverlaps([triangle(), triangle()]);
  assert.equal(r.complete, true);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].overlapAreaSquareMetres, 0.5);
  assert(r.findings[0].point.every(Number.isFinite));
});
test("shared triangle edges and opposing contact faces are not overlap findings", () => {
  const adjacent = face([
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
  ]);
  const opposing = face([
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 0],
  ]);
  assert.equal(coplanarOverlaps([triangle(), adjacent]).findings.length, 0);
  assert.equal(coplanarOverlaps([triangle(), opposing]).findings.length, 0);
});
test("separated parallel surfaces and buried duplicate faces are excluded", () => {
  assert.equal(
    coplanarOverlaps([triangle(), triangle(0.001)]).findings.length,
    0,
  );
  assert.equal(
    coplanarOverlaps([triangle(), triangle(), triangle(1)]).findings.length,
    0,
  );
});
test("nearly coplanar surfaces are compared across plane-bucket boundaries", () => {
  assert.equal(
    coplanarOverlaps([triangle(0.000019), triangle(0.000021)]).findings.length,
    1,
  );
});
test("analysis limits are explicit instead of reporting a false complete pass", () => {
  const r = coplanarOverlaps(Array(10001).fill(triangle()));
  assert.equal(r.complete, false);
  assert.match(r.reason, /10000/);
});
test("real exported overlap regression distinguishes large rejected patches and residual accepted hardware overlaps", async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const read = async (name) =>
    coplanarOverlaps(
      worldTriangles(
        await io.read(path.join(TOOL, "proof/overlap-trial", name)),
      ),
    );
  const rejected = await read("rejected.glb"),
    accepted = await read("accepted.glb");
  assert(rejected.findings.length > 0);
  assert(
    Math.max(...rejected.findings.map((f) => f.overlapAreaSquareMetres)) >
      0.001,
  );
  assert.equal(accepted.complete, true);
  // The accepted visual result still contains small hardware/underside overlaps.
  // Keep these visible in diagnostics; do not tune them away to claim perfection.
  assert(accepted.findings.length > 0);
  assert(
    Math.max(...accepted.findings.map((f) => f.overlapAreaSquareMetres)) <
      0.0001,
  );
  const refined = await read("refined.glb");
  assert.equal(refined.complete, true);
  assert.equal(refined.findings.length, 0);
});
test("existing radio, crate, lantern and workbench exports remain clean controls", async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  for (const name of [
    "original-radio",
    "crate-seams",
    "lantern",
    "workbench-joints",
  ]) {
    const r = coplanarOverlaps(
      worldTriangles(
        await io.read(path.join(TOOL, "proof", name, "model.glb")),
      ),
    );
    assert.equal(r.complete, true, name);
    assert.equal(r.findings.length, 0, name);
  }
});
