import { beforeAll, describe, it, expect } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { scooterSupportHeight } from "./scooter-support";
beforeAll(async () => {
  await RAPIER.init();
});
describe("scooter parking support", () => {
  it("parks on an elevated porch rather than the terrain below it", () => {
    const world = new RAPIER.World({ x: 0, y: -12, z: 0 });
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(10, 0.1, 10).setTranslation(0, -0.1, 0),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(2, 0.15, 2).setTranslation(0, 0.47, 0),
    );
    const rider = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.57, 0),
    );
    world.createCollider(RAPIER.ColliderDesc.capsule(0.35, 0.3), rider);
    world.step();
    expect(scooterSupportHeight(world, 0, 0, 1.57, rider)).toBeCloseTo(0.62, 5);
    expect(scooterSupportHeight(world, 4, 0, 1.57, rider)).toBeCloseTo(0, 5);
    world.free();
  });
  it("returns no parking surface over a gap instead of teleporting down", () => {
    const world = new RAPIER.World({ x: 0, y: -12, z: 0 });
    expect(scooterSupportHeight(world, 0, 0, 10)).toBeUndefined();
    world.free();
  });
});
