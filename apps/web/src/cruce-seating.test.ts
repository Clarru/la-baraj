import { describe, expect, it } from "vitest";
import { cruceContactForPose } from "./cruce-seating";
import { activitySeatLift } from "./character-actions";
import type { ActivityPose } from "./activity-state";
import {
  CRUCE_TABLE as table,
  CRUCE_CHARACTER_SEAT_HEIGHT,
  cruceSeatPose,
} from "../../../packages/shared/cruce-station";
describe("Cruce seated contact through the complete visual lift", () => {
  it("matches authoritative rendered roots at all four seats without double lift", () => {
    for (const seat of [0, 1, 2, 3] as const) {
      const rendered = cruceSeatPose(seat);
      const pose: ActivityPose = {
        kind: "sit",
        startedAt: 0,
        anchor: [rendered.position[0], table.ground, rendered.position[2]],
        seatHeight: table.ground + table.seatSurface,
      };
      const contact = cruceContactForPose(null, pose, seat)!;
      const bodyY = pose.anchor![1] + 0.95,
        visualY = -0.95 + activitySeatLift(pose, 1, contact.height);
      expect(bodyY + visualY).toBeCloseTo(rendered.position[1], 10);
      expect(rendered.position[1] + CRUCE_CHARACTER_SEAT_HEIGHT).toBeCloseTo(
        table.ground + table.seatSurface,
        10,
      );
    }
  });
  it("retains contact when authority clears the seat during stand-up, then clears on exit/forced leave", () => {
    const pose: ActivityPose = {
      kind: "sit-down",
      startedAt: 0,
      anchor: [5, table.ground, 69.50531356447997],
      seatHeight: table.ground + table.seatSurface,
    };
    let contact = cruceContactForPose(null, pose, 0);
    expect(contact).not.toBeNull();
    expect(activitySeatLift(pose, 0, contact!.height)).toBe(0);
    pose.kind = "sit";
    contact = cruceContactForPose(contact, pose, 0);
    const sitting = activitySeatLift(pose, 1, contact!.height);
    pose.kind = "stand-up";
    contact = cruceContactForPose(contact, pose, null);
    expect(contact!.height).toBe(CRUCE_CHARACTER_SEAT_HEIGHT);
    expect(activitySeatLift(pose, 0, contact!.height)).toBeCloseTo(sitting, 10);
    expect(activitySeatLift(pose, 0.65, contact!.height)).toBe(0);
    expect(
      cruceContactForPose(contact, { kind: "none", startedAt: 1 }, null),
    ).toBeNull();
    expect(
      cruceContactForPose(
        contact,
        { ...pose, kind: "sit", anchor: [20, table.ground, 30] },
        null,
      ),
    ).toBeNull();
    const reconnected = cruceContactForPose(null, { ...pose, kind: "sit" }, 0);
    expect(reconnected!.height).toBe(CRUCE_CHARACTER_SEAT_HEIGHT);
  });
  it("keeps the original calibration for every other bench", () => {
    const pose: ActivityPose = {
      kind: "sit",
      startedAt: 0,
      anchor: [0, 2, 0],
      seatHeight: 2.47,
    };
    expect(cruceContactForPose(null, pose, null)).toBeNull();
    expect(activitySeatLift(pose, 1)).toBeCloseTo(0.02, 10);
    expect(activitySeatLift(pose, 1, undefined)).toBe(
      activitySeatLift(pose, 1),
    );
  });
});
