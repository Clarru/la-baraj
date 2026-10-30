import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { resizeStanceCollider, rotateProneCollider } from "./stance-physics";
import {
  stanceColliderRotation,
  stanceControllerHeight,
} from "./stance-motion";

beforeAll(async () => {
  await RAPIER.init();
});

function worldWithBody() {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(4, 0.05, 4).setTranslation(0, -0.05, 0),
  );
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, stanceControllerHeight("crouching"), 0)
      .lockRotations(),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(0.18, 0.3),
    body,
  );
  return { world, body, collider };
}

describe("stance collider clearance", () => {
  it("expands the real collider using the target controller envelope", () => {
    const { world, body, collider } = worldWithBody();
    const before = body.translation().y;
    expect(
      resizeStanceCollider({
        current: "crouching",
        next: "standing",
        body,
        collider,
        world,
        rapier: RAPIER,
      }),
    ).toBe(true);
    expect(body.translation().y).toBeCloseTo(
      before +
        stanceControllerHeight("standing") -
        stanceControllerHeight("crouching"),
      6,
    );
    world.free();
  });

  it("rotates the prone capsule along facing instead of leaving a short upright ball", () => {
    const { world, body, collider } = worldWithBody();
    expect(
      resizeStanceCollider({
        current: "crouching",
        next: "prone",
        body,
        collider,
        world,
        rapier: RAPIER,
        yaw: Math.PI / 2,
      }),
    ).toBe(true);
    expect(body.translation().y).toBeCloseTo(
      stanceControllerHeight("prone"),
      6,
    );
    // World-space setRotation is overwritten by the parent on the next step.
    // The relative collider orientation must survive real simulation updates.
    for (let step = 0; step < 4; step++) world.step();
    expect(Math.abs(collider.rotation().x)).toBeGreaterThan(0.4);
    expect(Math.abs(collider.rotation().y)).toBeGreaterThan(0.4);
    world.free();
  });

  it("rejects standing and prone-to-crouch growth under a low solid ceiling", () => {
    const standingSpace = worldWithBody();
    standingSpace.world.createCollider(
      RAPIER.ColliderDesc.cuboid(4, 0.05, 4).setTranslation(0, 1.05, 0),
    );
    standingSpace.world.step();
    expect(
      resizeStanceCollider({
        current: "crouching",
        next: "standing",
        body: standingSpace.body,
        collider: standingSpace.collider,
        world: standingSpace.world,
        rapier: RAPIER,
      }),
    ).toBe(false);
    standingSpace.world.free();

    const prone = worldWithBody();
    prone.body.setTranslation(
      { x: 0, y: stanceControllerHeight("prone"), z: 0 },
      true,
    );
    prone.collider.setShape(new RAPIER.Capsule(0.65, 0.4));
    prone.collider.setRotationWrtParent(stanceColliderRotation("prone", 0));
    prone.world.createCollider(
      RAPIER.ColliderDesc.cuboid(4, 0.05, 4).setTranslation(0, 1.05, 0),
    );
    prone.world.step();
    expect(
      resizeStanceCollider({
        current: "prone",
        next: "crouching",
        body: prone.body,
        collider: prone.collider,
        world: prone.world,
        rapier: RAPIER,
      }),
    ).toBe(false);
    prone.world.free();
  });

  it("ignores sensor-only overhead while still checking solid colliders", () => {
    const { world, body, collider } = worldWithBody();
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(4, 0.05, 4)
        .setTranslation(0, 1.05, 0)
        .setSensor(true),
    );
    world.step();
    expect(
      resizeStanceCollider({
        current: "crouching",
        next: "standing",
        body,
        collider,
        world,
        rapier: RAPIER,
      }),
    ).toBe(true);
    world.free();
  });

  it("checks the target horizontal footprint when entering prone near a wall", () => {
    const { world, body, collider } = worldWithBody();
    body.setTranslation(
      { x: 0, y: stanceControllerHeight("standing"), z: 0 },
      true,
    );
    collider.setShape(new RAPIER.Capsule(0.35, 0.3));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.05, 2, 0.05).setTranslation(0, 0.8, 0.9),
    );
    world.step();
    expect(
      resizeStanceCollider({
        current: "standing",
        next: "prone",
        body,
        collider,
        world,
        rapier: RAPIER,
        yaw: 0,
      }),
    ).toBe(false);
    world.free();
  });

  it("blocks prone yaw turns whose rotated footprint would enter a wall", () => {
    const { world, body, collider } = worldWithBody();
    body.setTranslation(
      { x: 0, y: stanceControllerHeight("prone"), z: 0 },
      true,
    );
    collider.setShape(new RAPIER.Capsule(0.65, 0.4));
    collider.setRotationWrtParent(stanceColliderRotation("prone", 0));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.05, 2, 0.05).setTranslation(0.9, 0.8, 0),
    );
    world.step();
    const before = collider.rotation();
    expect(
      rotateProneCollider({
        body,
        collider,
        world,
        rapier: RAPIER,
        yaw: Math.PI / 2,
      }),
    ).toBe(false);
    expect(collider.rotation()).toEqual(before);
    world.free();
  });
});
