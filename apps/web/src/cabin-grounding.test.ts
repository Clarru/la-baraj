import { describe, expect, it } from "vitest";
import { planLevelFoundation, sampleFootprintGround } from "./cabin-grounding";

const footprint = { minX: -3, maxX: 3, minZ: -4, maxZ: 4 };
const pose = { x: 20, z: 30, yaw: 0 };

describe("level building foundations", () => {
  it("keeps one level underside above a slope and takes every support into the ground", () => {
    const samples = sampleFootprintGround(
      footprint,
      pose,
      (x, z) => 4 + (x - 20) * 0.1 + (z - 30) * 0.05,
    );
    const result = planLevelFoundation(samples, {
      clearance: 0.08,
      embedment: 0.15,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.baseY).toBeCloseTo(4.58);
    expect(result.groundRise).toBeCloseTo(1);
    expect(result.span).toBeCloseTo(10);
    expect(result.supports).toHaveLength(9);
    for (const support of result.supports) {
      expect(support.topY).toBe(result.baseY);
      expect(support.bottomY).toBeCloseTo(support.groundY - 0.15);
      expect(support.centerY - support.length / 2).toBeCloseTo(support.bottomY);
      expect(support.centerY + support.length / 2).toBeCloseTo(result.baseY);
      expect(support.length).toBeGreaterThan(0);
    }
  });

  it("samples the centre as well as the perimeter so a ground hump raises the base", () => {
    const result = planLevelFoundation(
      sampleFootprintGround(footprint, pose, (x, z) =>
        x === 20 && z === 30 ? 1.3 : 1,
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.baseY).toBeCloseTo(1.34);
    expect(
      result.supports.every((support) => support.topY >= support.groundY),
    ).toBe(true);
  });

  it("transforms an asymmetric footprint using the same positive Y yaw as the cabin", () => {
    const calls: [number, number][] = [];
    const samples = sampleFootprintGround(
      { minX: 1, maxX: 3, minZ: 2, maxZ: 6 },
      { x: 10, z: 20, yaw: Math.PI / 2 },
      (x, z) => {
        calls.push([x, z]);
        return x + z;
      },
    );
    expect(samples).toHaveLength(9);
    expect(samples[0].x).toBeCloseTo(12);
    expect(samples[0].z).toBeCloseTo(19);
    expect(samples[8].x).toBeCloseTo(16);
    expect(samples[8].z).toBeCloseTo(17);
    expect(
      samples.every(
        (sample, i) => sample.groundY === calls[i][0] + calls[i][1],
      ),
    ).toBe(true);
  });

  it("rejects excessive ground rise, footprint span, and exposed support height", () => {
    const samples = sampleFootprintGround(footprint, pose, (x) => x / 10);
    expect(planLevelFoundation(samples, { maxRise: 0.5 })).toEqual({
      ok: false,
      reason: "rise-exceeded",
    });
    expect(planLevelFoundation(samples, { maxSpan: 9 })).toEqual({
      ok: false,
      reason: "span-exceeded",
    });
    expect(planLevelFoundation(samples, { maxSupportHeight: 0.6 })).toEqual({
      ok: false,
      reason: "support-height-exceeded",
    });
  });

  it("allows limits exactly at the supported terrain values", () => {
    const samples = sampleFootprintGround(footprint, pose, (x) =>
      x === 23 ? 1 : 0,
    );
    expect(
      planLevelFoundation(samples, {
        maxRise: 1,
        maxSpan: 10,
        maxSupportHeight: 1,
        clearance: 0,
        embedment: 0,
      }).ok,
    ).toBe(true);
  });

  it("fails safely when terrain sampling misses the ground or the footprint is degenerate", () => {
    expect(planLevelFoundation([])).toEqual({
      ok: false,
      reason: "insufficient-footprint",
    });
    expect(
      planLevelFoundation(sampleFootprintGround(footprint, pose, () => NaN)),
    ).toEqual({ ok: false, reason: "invalid-samples" });
    expect(
      planLevelFoundation([
        { x: 0, z: 0, groundY: 1 },
        { x: 1, z: 1, groundY: 1 },
        { x: 2, z: 2, groundY: 1 },
      ]),
    ).toEqual({ ok: false, reason: "insufficient-footprint" });
    expect(
      sampleFootprintGround({ ...footprint, maxX: -4 }, pose, () => 0),
    ).toEqual([]);
    expect(
      planLevelFoundation(
        sampleFootprintGround(footprint, pose, () => 0),
        { embedment: -1 },
      ),
    ).toEqual({ ok: false, reason: "invalid-options" });
  });
});
