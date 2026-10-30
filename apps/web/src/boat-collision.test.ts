import { afterEach, beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { BOAT_DIMENSIONS } from "./boat-geometry";
import {
  boatHullBlocked,
  boatTurnBlocked,
  applyBoatBodyImpact,
} from "./boat-collision";
import { advanceBoat, createBoatMotionState } from "./boat-motion";
import { LAKE_LEVEL } from "./swim-motion";

const { beam, bowExtent } = BOAT_DIMENSIONS;

beforeAll(async () => {
  await RAPIER.init();
});
const worlds: RAPIER.World[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.free();
});

/** A world holding an optional 0.16 × 1.3 × 0.16 m piling, plus the driver's capsule at the pivot. */
function scene(piling?: { x: number; y: number; z: number }) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  worlds.push(world);
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
  it("applies a horizontal boat impact without a jump or gravity change", () => {
    const { world, capsule } = scene();
    capsule.setTranslation({ x: 0, y: 0.8, z: 0 }, true);
    capsule.setGravityScale(0, true);
    capsule.setLinvel({ x: 0, y: 0.1, z: 0 }, true);
    const motion = createBoatMotionState(0);
    expect(
      applyBoatBodyImpact(world, RAPIER, capsule, motion, {
        position: [1, 0],
        yaw: 0,
        velocity: [3, 2],
      }),
    ).toBe(true);
    expect(capsule.translation().y).toBeCloseTo(0.8);
    expect(capsule.linvel().y).toBeCloseTo(0.1);
    expect(capsule.gravityScale()).toBe(0);
    expect(capsule.linvel().x).toBeCloseTo(3);
  });
  it("does not separate through a world obstacle", () => {
    const { world, capsule } = scene({ x: 0, y: 0.4, z: bowExtent + 0.2 });
    const motion = createBoatMotionState(0);
    expect(
      applyBoatBodyImpact(world, RAPIER, capsule, motion, {
        position: [0, 1],
        yaw: 0,
        velocity: [0, -1],
      }),
    ).toBe(false);
    expect(capsule.translation().z).toBe(0);
    expect(capsule.linvel().z).toBe(-1);
  });
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

describe("boat steering clearance", () => {
  const orientation = (yaw: number) => ({
    x: 0,
    y: Math.sin(yaw / 2),
    z: 0,
    w: Math.cos(yaw / 2),
  });
  function overlaps(world: RAPIER.World, body: RAPIER.RigidBody, yaw: number) {
    const centre =
      (BOAT_DIMENSIONS.bowExtent - BOAT_DIMENSIONS.sternExtent) / 2;
    return Boolean(
      world.intersectionWithShape(
        {
          x: Math.sin(yaw) * centre,
          y: LAKE_LEVEL + 0.4,
          z: Math.cos(yaw) * centre,
        },
        orientation(yaw),
        new RAPIER.Cuboid(
          beam / 2,
          0.35,
          (BOAT_DIMENSIONS.bowExtent + BOAT_DIMENSIONS.sternExtent) / 2,
        ),
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        body,
      ),
    );
  }

  it("rejects the reproduced clear-to-penetrating steering step before committing yaw", () => {
    const { world, capsule } = scene({ x: beam / 2 + 0.12, y: 0.4, z: 3.1 });
    const motion = createBoatMotionState(0);
    motion.speed = 8;
    motion.steer = 1;
    expect(overlaps(world, capsule, 0)).toBe(false);
    // The old translation-only query misses the already-rotated intersection.
    expect(overlaps(world, capsule, 0.015)).toBe(true);
    expect(
      boatHullBlocked(world, RAPIER, {
        x: 0,
        z: 0,
        yaw: 0.015,
        dx: (Math.sin(0.015) * 8) / 60,
        dz: (Math.cos(0.015) * 8) / 60,
        exclude: capsule,
      }),
    ).toBe(false);
    advanceBoat(motion, {
      throttle: 1,
      steer: 1,
      dt: 1 / 60,
      canTurn: (fromYaw, toYaw) =>
        !boatTurnBlocked(world, RAPIER, {
          x: 0,
          z: 0,
          fromYaw,
          toYaw,
          exclude: capsule,
        }),
    });
    expect(motion.yaw).toBe(0);
    expect(motion.turnRate).toBe(0);
    expect(motion.wheelAngle).toBe(0);
    expect(overlaps(world, capsule, motion.yaw)).toBe(false);
  });

  it("covers thin obstacles swept by a corner even when both endpoint hulls are clear", () => {
    const { world, capsule } = scene();
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.001, 0.2, 0.001).setTranslation(
        beam / 2 - 0.001,
        0.4,
        bowExtent - 0.001,
      ),
    );
    world.step();
    expect(overlaps(world, capsule, -0.02)).toBe(false);
    expect(overlaps(world, capsule, 0.02)).toBe(false);
    expect(
      boatTurnBlocked(world, RAPIER, {
        x: 0,
        z: 0,
        fromYaw: -0.02,
        toYaw: 0.02,
        exclude: capsule,
      }),
    ).toBe(true);
  });

  it.each([1, -1])(
    "protects bow and stern during turns in direction %s",
    (sign) => {
      for (const z of [3.1, -BOAT_DIMENSIONS.sternExtent + 0.2]) {
        const { world, capsule } = scene({
          x: Math.sign(z) * sign * (beam / 2 + 0.1),
          y: 0.4,
          z,
        });
        expect(overlaps(world, capsule, 0)).toBe(false);
        expect(
          boatTurnBlocked(world, RAPIER, {
            x: 0,
            z: 0,
            fromYaw: 0,
            toYaw: sign * 0.05,
            exclude: capsule,
          }),
        ).toBe(true);
      }
    },
  );

  it("preserves free steering, ignores sensors and its driver, and wraps the yaw seam", () => {
    const { world, capsule } = scene();
    world.createCollider(RAPIER.ColliderDesc.cuboid(2, 1, 4).setSensor(true));
    world.step();
    const motion = createBoatMotionState(0);
    motion.speed = 8;
    motion.steer = 1;
    advanceBoat(motion, {
      throttle: 1,
      steer: 1,
      dt: 1 / 60,
      canTurn: (fromYaw, toYaw) =>
        !boatTurnBlocked(world, RAPIER, {
          x: 0,
          z: 0,
          fromYaw,
          toYaw,
          exclude: capsule,
        }),
    });
    expect(motion.yaw).toBeCloseTo(0.015);
    expect(motion.turnRate).toBeCloseTo(0.9);
    expect(
      boatTurnBlocked(world, RAPIER, {
        x: 0,
        z: 0,
        fromYaw: Math.PI - 0.01,
        toYaw: -Math.PI + 0.01,
        exclude: capsule,
      }),
    ).toBe(false);
  });

  it("still permits straight reverse travel away from a nearby piling", () => {
    const { world, capsule } = scene({ x: 0, y: 0.4, z: bowExtent + 0.2 });
    expect(
      boatHullBlocked(world, RAPIER, {
        x: 0,
        z: 0,
        yaw: 0,
        dx: 0,
        dz: -0.1,
        exclude: capsule,
      }),
    ).toBe(false);
  });
});
