import { afterEach, beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { BOAT_DIMENSIONS } from "./boat-geometry";
import {
  boatHullBlocked,
  boatTurnBlocked,
  applyBoatBodyImpact,
  boatPrism,
  boatHullHit,
  applyBoatWorldImpact,
  setRemoteBoatCollision,
  PARKED_BOAT_VERTICES,
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
  it("does not collide with empty space beside the tapered bow", () => {
    const { world, capsule } = scene({
      x: beam / 2 - 0.05,
      y: 0.4,
      z: bowExtent - 0.3,
    });
    expect(
      boatHullBlocked(world, RAPIER, {
        x: 0,
        z: 0,
        yaw: 0,
        dx: 0,
        dz: 0.05,
        exclude: capsule,
      }),
    ).toBe(false);
  });
  it("uses a world-space contact to deflect and turn a hull against a piling", () => {
    const { world, capsule } = scene({ x: 0.95, y: 0.4, z: 2 });
    const hit = boatHullHit(world, RAPIER, {
      x: 0,
      z: 0,
      yaw: 0,
      dx: 0.2,
      dz: 0,
      exclude: capsule,
    });
    expect(hit?.normal).not.toBeNull();
    const motion = createBoatMotionState(0);
    motion.speed = 4;
    motion.driftX = 3;
    applyBoatWorldImpact(motion, [0, 0], hit!.point, hit!.normal!);
    expect(motion.turnRate).toBeLessThan(0);
    expect(motion.driftX).toBeLessThan(3);
    expect(motion.speed).toBeGreaterThan(0);
  });
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
    const ahead = scene(piling(0, bowExtent + 0.1));
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
    return Boolean(
      world.intersectionWithShape(
        { x: 0, y: LAKE_LEVEL + 0.4, z: 0 },
        orientation(yaw),
        new RAPIER.ConvexPolyhedron(boatPrism().vertices, boatPrism().indices),
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        body,
      ),
    );
  }

  it("rejects the reproduced clear-to-penetrating steering step before committing yaw", () => {
    const { world, capsule } = scene();
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.003, 0.65, 0.003).setTranslation(
        0.114,
        0.4,
        bowExtent - 0.004,
      ),
    );
    world.step();
    const motion = createBoatMotionState(0);
    motion.speed = 8;
    motion.steer = 1;
    motion.turnRate = 0.9;
    expect(overlaps(world, capsule, 0)).toBe(false);
    expect(overlaps(world, capsule, 0.015)).toBe(true);
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
    expect(motion.wheelAngle).toBeGreaterThan(0);
    expect(overlaps(world, capsule, motion.yaw)).toBe(false);
  });

  it("covers thin obstacles swept by a corner even when both endpoint hulls are clear", () => {
    const { world, capsule } = scene();
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.001, 0.2, 0.001).setTranslation(
        0,
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
      for (const z of [bowExtent - 0.01, -BOAT_DIMENSIONS.sternExtent + 0.05]) {
        const { world, capsule } = scene({
          x: z > 0 ? sign * 0.22 : -sign * ((beam / 2) * 0.86 + 0.1),
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
    expect(motion.yaw).toBeGreaterThan(0);
    expect(motion.yaw).toBeLessThan(0.015);
    expect(motion.turnRate).toBeGreaterThan(0);
    expect(motion.turnRate).toBeLessThan(0.9);
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

// The disabled flag alone is insufficient in the shipped Rapier contact pipeline.
// Hold ride height here so a ghost hull cannot be escaped by climbing over it.
describe("remote boat physical presence", () => {
  function setup() {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    worlds.push(world);
    const driver = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0.893, 0.785, -60)
        .enabledTranslations(true, false, true)
        .setCcdEnabled(true),
    );
    world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.3), driver);
    const remote = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        0,
        0.05,
        -48,
      ),
    );
    world.createCollider(
      RAPIER.ColliderDesc.convexHull(PARKED_BOAT_VERTICES)!,
      remote,
    );
    world.step();
    const drive = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        driver.setLinvel({ x: 0, y: 0, z: 4 }, true);
        world.step();
      }
    };
    return { world, driver, remote, drive };
  }
  it("an occupied remote hull cannot leave a ghost stern blocking the driver", () => {
    const { driver, remote, drive } = setup();
    setRemoteBoatCollision(remote, false);
    drive(480);
    expect(driver.translation().z).toBeCloseTo(-28, 2);
    expect(driver.translation().y).toBeCloseTo(0.785, 5);
    expect(driver.linvel().z).toBeCloseTo(4, 5);
    expect(remote.collider(0).collisionGroups()).toBe(0);
  });
  it("a moored hull becomes solid again after its driver leaves", () => {
    const { driver, remote, drive } = setup();
    setRemoteBoatCollision(remote, false);
    drive(60);
    setRemoteBoatCollision(remote, true);
    drive(420);
    expect(driver.translation().z).toBeLessThan(-50.5);
    expect(remote.collider(0).collisionGroups()).toBe(0xffffffff);
  });
  it("boarding a moored boat releases an already contacting local driver", () => {
    const { driver, remote, drive } = setup();
    setRemoteBoatCollision(remote, true);
    drive(240);
    const stopped = driver.translation().z;
    expect(stopped).toBeLessThan(-50.5);
    setRemoteBoatCollision(remote, false);
    drive(120);
    expect(driver.translation().z - stopped).toBeGreaterThan(7.9);
    expect(driver.translation().y).toBeCloseTo(0.785, 5);
  });
});
