import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { BOAT_DIMENSIONS } from "./boat-geometry";
import { boatHullBlocked } from "./boat-collision";

const { beam, bowExtent } = BOAT_DIMENSIONS;

beforeAll(async () => {
  await RAPIER.init();
});

/** A world holding an optional 0.16 × 1.3 × 0.16 m piling, plus the driver's capsule at the pivot. */
function scene(piling?: { x: number; y: number; z: number }) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  if (piling)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.08, 0.65, 0.08).setTranslation(
        piling.x,
        piling.y,
        piling.z,
      ),
    );
  const capsule = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.35, 0),
  );
  world.createCollider(RAPIER.ColliderDesc.capsule(0.35, 0.3), capsule);
  // One step builds the broad phase that scene queries read.
  world.step();
  return { world, capsule };
}

describe("boat hull collision", () => {
  it("stops before a piling dead ahead", () => {
    const { world, capsule } = scene({ x: 0, y: 0.4, z: bowExtent + 0.2 });
    expect(
      boatHullBlocked(world, RAPIER, {
        x: 0,
        z: 0,
        yaw: 0,
        dx: 0,
        dz: 0.15,
        exclude: capsule,
      }),
    ).toBe(true);
    // Beyond this frame's motion plus the look-ahead, the piling does not block yet.
    const far = scene({ x: 0, y: 0.4, z: bowExtent + 1 });
    expect(
      boatHullBlocked(far.world, RAPIER, {
        x: 0,
        z: 0,
        yaw: 0,
        dx: 0,
        dz: 0.15,
        exclude: far.capsule,
      }),
    ).toBe(false);
  });

  it("stops on a diagonal approach", () => {
    // Heading 0.3 rad, a piling 0.25 m ahead of the left bow corner (hull-local
    // side beam/2 − 0.05, forward bowExtent + 0.25): clear of the hull at the
    // start, so only the sweep carries the corner into it.
    const yaw = 0.3;
    const piling = (side: number, forward: number) => ({
      x: side * Math.cos(yaw) + forward * Math.sin(yaw),
      y: 0.4,
      z: -side * Math.sin(yaw) + forward * Math.cos(yaw),
    });
    const move = (speed: number) => ({
      x: 0,
      z: 0,
      yaw,
      dx: Math.sin(yaw) * speed,
      dz: Math.cos(yaw) * speed,
    });
    const ahead = scene(piling(beam / 2 - 0.05, bowExtent + 0.25));
    expect(
      boatHullBlocked(ahead.world, RAPIER, {
        ...move(0.1),
        exclude: ahead.capsule,
      }),
    ).toBe(true);
    // The same piling does not block when backing away from it.
    expect(
      boatHullBlocked(ahead.world, RAPIER, {
        ...move(-0.1),
        exclude: ahead.capsule,
      }),
    ).toBe(false);
    // A piling just outside the corner's path is passed, not hit.
    const beside = scene(piling(beam / 2 + 0.2, bowExtent + 0.25));
    expect(
      boatHullBlocked(beside.world, RAPIER, {
        ...move(0.1),
        exclude: beside.capsule,
      }),
    ).toBe(false);
  });

  it("open water is clear", () => {
    const { world, capsule } = scene();
    expect(
      boatHullBlocked(world, RAPIER, {
        x: 0,
        z: 0,
        yaw: 0,
        dx: 0,
        dz: 0.15,
        exclude: capsule,
      }),
    ).toBe(false);
  });

  it("ignores its own capsule", () => {
    const { world, capsule } = scene();
    for (const [dx, dz] of [
      [0, 0.15],
      [0, -0.15],
      [0.1, 0],
    ])
      expect(
        boatHullBlocked(world, RAPIER, {
          x: 0,
          z: 0,
          yaw: 1,
          dx,
          dz,
          exclude: capsule,
        }),
      ).toBe(false);
  });
});
