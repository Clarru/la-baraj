import { beforeAll, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  isSolidVegetation,
  treeCollision,
  treeColliderDesc,
} from "./vegetation-collision";

it("lets players walk through decorative plants while retaining solid trunks and rocks", () => {
  for (const id of [
    "Flower_3_Group",
    "Grass_Common_Short",
    "Fern_1",
    "Bush_Common",
  ])
    expect(isSolidVegetation(id), id).toBe(false);
  for (const id of [
    "Cincis_Oak_1",
    "Cincis_Oak_1_Distant",
    "Cincis_Beech_1",
    "Cincis_Beech_1_Distant",
    "CommonTree_1",
    "Pine_2_Distant",
    "Rock_Medium_1",
  ])
    expect(isSolidVegetation(id), id).toBe(true);
});

it("uses the authored oak trunk dimensions independently of the padded sprite", () => {
  expect(treeCollision("Cincis_Oak_1_Distant", 11.44)).toEqual({
    treeHeight: 6,
    treeRadius: 0.4,
  });
  expect(treeCollision("Cincis_Beech_1_Distant", 11.33)).toEqual({
    treeHeight: 6,
    treeRadius: 0.45,
  });
  expect(treeCollision("CommonTree_1", 10).treeHeight).toBeCloseTo(7.2);
});

beforeAll(async () => {
  await RAPIER.init();
});

it.each([
  ["Cincis_Oak_1", 0.4],
  ["Cincis_Beech_1", 0.45],
] as const)(
  "blocks a moving capsule at %s and leaves space beside it",
  (id, radius) => {
    for (const scale of [0.85, 1.4]) {
      for (const offset of [0, 1.4]) {
        const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
        const trunk = treeCollision(id, 11.44);
        world.createCollider(
          treeColliderDesc(RAPIER, { x: 2, y: 3, z: -4, scale, ...trunk }),
        );
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(0, 4, -4 + offset)
            .lockRotations()
            .setCcdEnabled(true),
        );
        world.createCollider(RAPIER.ColliderDesc.capsule(0.35, 0.3), body);
        for (let i = 0; i < 150; i++) {
          body.setLinvel({ x: 2, y: 0, z: 0 }, true);
          world.step();
        }
        const x = body.translation().x;
        if (offset === 0) expect(x).toBeLessThan(2 - radius * scale - 0.25);
        else expect(x).toBeGreaterThan(3);
        world.free();
      }
    }
  },
);
