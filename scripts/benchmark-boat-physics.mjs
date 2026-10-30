/** Node 24 only. Function/query benchmarks, not whole-game or Cloudflare billing measurements. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { build } from "esbuild";
import RAPIER from "@dimforge/rapier3d-compat";
import * as modern from "../packages/shared/boats.ts";
const folder = path.resolve(".impeccable/review/boat-rigid-benchmark");
await fs.mkdir(folder, { recursive: true });
const baseline = process.argv[2] ?? "3c106da";
await fs.writeFile(
  path.join(folder, "before.ts"),
  execFileSync("git", ["show", `${baseline}:packages/shared/boats.ts`]),
);
const before = await import(pathToFileURL(path.join(folder, "before.ts")).href);
function measure(fn, iterations) {
  for (let i = 0; i < Math.min(iterations, 500); i++) fn();
  const trials = [];
  for (let r = 0; r < 5; r++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    trials.push(((performance.now() - start) * 1000) / iterations);
  }
  const sorted = [...trials].sort((a, b) => a - b);
  return { unit: "microseconds per call", median: sorted[2], trials };
}
const boat = (x = 0, z = 0, vx = 0, vz = 0) => ({
  position: [x, z],
  velocity: [vx, vz],
  yaw: 0,
  moored: false,
  angularVelocity: 0,
  rudder: 0,
});
const a = boat(0, 0, 0, 8),
  end = boat(0, 1.2, 0, 8),
  b = boat(0, 7);
const world = [
    a,
    b,
    ...Array.from({ length: 48 }, (_, i) => boat(30 + i * 10, 100)),
  ],
  targets = world.map((p, i) => (i === 0 ? end : p));
const dense = (sx, sz) => {
  const from = Array.from({ length: 50 }, (_, i) =>
    boat((i % 5) * sx, Math.floor(i / 5) * sz),
  );
  from[0].velocity = [3, 10];
  return [
    from,
    from.map((p, i) => (i === 0 ? { ...p, position: [0.6, 2] } : p)),
  ];
};
const [packed, packedTo] = dense(2.25, 6.3),
  [pile, pileTo] = dense(1.5, 3);
const report = {
  date: new Date().toISOString(),
  machine: os.cpus()[0]?.model,
  node: process.version,
  baseline,
  scope:
    "Matched Node function kernels and real Rapier queries. Not a browser-frame, Worker-runtime, or billing benchmark.",
  pair: {
    before: measure(() => before.sweepBoatImpact(a, end, b, b), 10000),
    after: measure(() => modern.sweepBoatImpact(a, end, b, b), 10000),
  },
  fiftyBoatsOneContact: {
    before: measure(() => {
      for (let j = 1; j < world.length; j++) {
        const p = world[j];
        if (Math.hypot(p.position[0], p.position[1]) < 10.2)
          before.sweepBoatImpact(a, end, p, p);
      }
    }, 3000),
    after: measure(
      () => modern.solveBoatContactIsland(world, targets, 0.15, 0),
      3000,
    ),
  },
  packed50: {
    after: measure(
      () => modern.solveBoatContactIsland(packed, packedTo, 0.2, 0),
      150,
    ),
    work: modern.solveBoatContactIsland(packed, packedTo, 0.2, 0).workUnits,
  },
  invalidOverlap50: {
    after: measure(
      () => modern.solveBoatContactIsland(pile, pileTo, 0.2, 0),
      150,
    ),
    work: modern.solveBoatContactIsland(pile, pileTo, 0.2, 0).workUnits,
    budgetLimited: modern.solveBoatContactIsland(pile, pileTo, 0.2, 0)
      .budgetLimited,
  },
};
// Use the actual browser helper with Node-compatible bundling, not a copied convex query.
const helper = path.join(folder, "world.cjs");
await build({
  entryPoints: ["apps/web/src/boat-collision.ts"],
  outfile: helper,
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  logLevel: "silent",
});
const { boatHullHit, boatTurnBlocked } = createRequire(import.meta.url)(helper);
await RAPIER.init();
const physics = new RAPIER.World({ x: 0, y: 0, z: 0 });
physics.createCollider(
  RAPIER.ColliderDesc.cuboid(0.08, 0.65, 0.08).setTranslation(0, 0.4, 3.9),
);
const driver = physics.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.8, 0),
);
physics.createCollider(RAPIER.ColliderDesc.capsule(0.35, 0.3), driver);
physics.step();
try {
  const query = { x: 0, z: 0, yaw: 0, dx: 0, dz: 0.15, exclude: driver };
  report.worldQuery = {
    beforeBox: measure(
      () =>
        physics.castShape(
          { x: 0, y: 0.45, z: 0.61 },
          { x: 0, y: 0, z: 0, w: 1 },
          { x: 0, y: 0, z: 1 },
          new RAPIER.Cuboid(1.1035, 0.35, 3.073),
          0,
          0.45,
          false,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          undefined,
          driver,
        ),
      10000,
    ),
    afterConvex: measure(() => boatHullHit(physics, RAPIER, query), 10000),
    afterAngular: measure(
      () =>
        boatTurnBlocked(physics, RAPIER, {
          x: 0,
          z: 0,
          fromYaw: 0,
          toYaw: 0.015,
          exclude: driver,
        }),
      10000,
    ),
  };
} finally {
  physics.free();
}
const categories = { moored: [], straight: [], turning: [], impact: [] };
const bytes = (p) => Buffer.byteLength(JSON.stringify(p));
for (let i = 0; i < 30; i++)
  for (const category of Object.keys(categories)) {
    const yaw = category === "straight" ? 0 : i * 0.13,
      parked = category === "moored";
    const p = {
      position: parked
        ? [3.7, 40.875186428]
        : [
            Math.fround(3.7 + i * 0.123456789),
            Math.fround(-70 + i * 0.987654321),
          ],
      velocity: parked ? [0, 0] : [Math.sin(yaw) * 8, Math.cos(yaw) * 8],
      yaw: parked ? Math.PI : yaw,
    };
    const q = modern.quantizeBoatPose({
      ...p,
      ...(parked
        ? {}
        : {
            angularVelocity:
              category === "turning"
                ? 0.9
                : category === "impact"
                  ? Math.sin(i * 0.5)
                  : 0,
            rudder: category === "turning" ? 0.7 : 0,
          }),
    });
    const common = {
      position: [3.7, 0.05, -70],
      yaw: Math.round(yaw * 1000) / 1000,
      animation: parked ? "Walk" : "Activity_Sit",
      activity: "none",
      vehicle: parked ? "none" : "boat",
      posture: "standing",
      speed: 8,
      jumpPhase: "grounded",
      boatImpactRevision: 10,
    };
    const old = bytes({ type: "pose", pose: { ...common, boat: p } }),
      now = bytes({ type: "pose", pose: { ...common, boat: q } });
    categories[category].push({ before: old, after: now });
  }
report.wire = Object.fromEntries(
  Object.entries(categories).map(([name, samples]) => [
    name,
    {
      meanBefore: samples.reduce((s, p) => s + p.before, 0) / samples.length,
      meanAfter: samples.reduce((s, p) => s + p.after, 0) / samples.length,
      maxDelta: Math.max(...samples.map((p) => p.after - p.before)),
      samples: samples.length,
    },
  ]),
);
report.constraints = {
  poseMinimumIntervalMs: 120,
  newServices: 0,
  newTextures: 0,
  newVisibleMeshes: 0,
  contactWorkLimit: modern.BOAT_CONTACT_WORK_LIMIT,
  maxContactIsland: modern.BOAT_MAX_CONTACT_ISLAND,
  maxContinuousEvents: modern.BOAT_MAX_CONTACT_EVENTS,
};
const out = "docs/performance/results/boat-rigid-impacts-2026-10-30.json";
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    out,
    pair: report.pair.after.median,
    world50: report.fiftyBoatsOneContact.after.median,
    packed50: report.packed50.after.median,
    pile: report.invalidOverlap50.after.median,
    queries: report.worldQuery,
    wire: report.wire,
  }),
);
