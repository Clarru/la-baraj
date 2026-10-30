import { describe, it, expect } from "vitest";
import { createSeatingRegistry } from "./bench-registry";
import {
  CRUCE_TABLE as t,
  CRUCE_SEATS,
  cruceSeatPose,
} from "../../../packages/shared/cruce-station";
describe("physical Cruce square table and usable seats", () => {
  it("registers exactly four real seats outside the tabletop with synchronized server anchors", () => {
    const registry = createSeatingRegistry();
    for (const i of [0, 1, 2, 3] as const) {
      const a = (i * Math.PI) / 2;
      registry.registerBench({
        id: CRUCE_SEATS[i].split(":")[0],
        label: "Cruce",
        center: [
          t.x - Math.sin(a) * t.benchRadius,
          t.ground + t.seatHeight,
          t.z + Math.cos(a) * t.benchRadius,
        ],
        width: t.benchWidth,
        depth: t.benchDepth,
        floorHeight: t.ground,
        facing: Math.PI - a,
        capacity: 1,
        endMargin: 0.12,
      });
    }
    for (const i of [0, 1, 2, 3] as const) {
      const seat = registry.getSeat(CRUCE_SEATS[i]);
      expect(seat).toBeDefined();
      const pose = cruceSeatPose(i);
      expect(seat!.anchor[0]).toBeCloseTo(pose.position[0]);
      expect(seat!.anchor[2]).toBeCloseTo(pose.position[2]);
      expect(
        Math.max(
          Math.abs(seat!.anchor[0] - t.x),
          Math.abs(seat!.anchor[2] - t.z),
        ),
      ).toBeGreaterThan(t.halfWidth + 0.25);
    }
    expect(t.benchRadius - t.benchDepth / 2 - t.halfWidth).toBeGreaterThan(0.3);
  });
});
