import { describe, it, expect } from "vitest";
import { Bone, Group } from "three";
import { createTableReactionRig } from "./table-reactions";
import { createSeatingRegistry } from "./bench-registry";
import {
  PLANES_TABLE,
  PLANES_SEATS,
  planesSeatPose,
} from "../../../packages/shared/planes-station";

describe("table avatar integration", () => {
  it("removes additive reactions before every mixer frame, without accumulated bone drift", () => {
    const object = new Group(),
      bone = new Bone();
    bone.name = "upperarm_r";
    bone.rotation.set(0.13, 0.24, -0.3);
    object.add(bone);
    const original = bone.quaternion.clone(),
      rig = createTableReactionRig(object);
    for (let i = 0; i < 300; i++) {
      rig.beginFrame();
      expect(bone.quaternion.angleTo(original)).toBeLessThan(0.000001);
      rig.update({ kind: "win", startedAt: 0 }, 450);
      expect(bone.quaternion.angleTo(original)).toBeGreaterThan(0.1);
    }
    rig.dispose();
    expect(bone.quaternion.angleTo(original)).toBeLessThan(0.000001);
  });
  it("restores each game seat to the same anchor used by the semantic bench registry", () => {
    const registry = createSeatingRegistry();
    for (const side of [0, 1] as const) {
      const pose = planesSeatPose(side),
        benchX = PLANES_TABLE.x + (side === 0 ? -1 : 1.05);
      registry.registerBench({
        id: PLANES_SEATS[side].split(":")[0],
        label: "Planes",
        center: [benchX, PLANES_TABLE.ground + 0.52, PLANES_TABLE.z],
        width: 2.4,
        depth: 0.6,
        floorHeight: PLANES_TABLE.ground + 0.07,
        facing: pose.yaw,
        capacity: 1,
      });
      const seat = registry.getSeat(PLANES_SEATS[side])!;
      seat.anchor.forEach((v, i) => expect(v).toBeCloseTo(pose.position[i], 8));
      expect(seat.facing).toBe(pose.yaw);
    }
  });
});
