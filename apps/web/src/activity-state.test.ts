import { describe, it, expect } from "vitest";
import { sampleActivityPose, type ActivityPose } from "./activity-state";

describe("seated shift anchors", () => {
  const pose: ActivityPose = {
    kind: "scoot-left",
    startedAt: 1000,
    anchor: [0.65, 2, 4],
    fromAnchor: [0, 2, 4],
    shiftDuration: 0.6,
    facing: 0,
    seatHeight: 2.55,
  };
  it("moves continuously without changing the facing or mutating the destination", () => {
    expect(sampleActivityPose(pose, 900).anchor).toEqual([0, 2, 4]);
    expect(sampleActivityPose(pose, 1000).anchor).toEqual([0, 2, 4]);
    expect(sampleActivityPose(pose, 1300).anchor).toEqual([0.325, 2, 4]);
    expect(sampleActivityPose(pose, 1600).anchor).toEqual([0.65, 2, 4]);
    expect(sampleActivityPose(pose, 2000).anchor).toEqual([0.65, 2, 4]);
    expect(pose.anchor).toEqual([0.65, 2, 4]);
    expect(sampleActivityPose(pose, 1300).facing).toBe(0);
    let previous = -1;
    for (let now = 1000; now <= 1600; now += 10) {
      const x = sampleActivityPose(pose, now).anchor![0];
      expect(x).toBeGreaterThanOrEqual(previous);
      expect(x).toBeLessThanOrEqual(0.65);
      previous = x;
    }
  });
  it("does not alter other activities and safely completes invalid durations", () => {
    const sit = { ...pose, kind: "sit" as const };
    expect(sampleActivityPose(sit, 1200)).toBe(sit);
    expect(
      sampleActivityPose({ ...pose, shiftDuration: 0 }, 1100).anchor,
    ).toEqual(pose.anchor);
  });
});
