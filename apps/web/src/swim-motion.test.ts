import { describe, expect, it } from "vitest";
import { LAKE_LEVEL, swimVelocity, swimmingState } from "./swim-motion";

const dry = {
  swimming: false,
  inLake: true,
  depth: 0.8,
  bodyY: 0.7,
  indoors: false,
  occupied: false,
};
describe("surface swimming", () => {
  it("enters only in sufficiently deep water, not on a dock or in an activity", () => {
    expect(swimmingState(dry)).toBe(true);
    expect(swimmingState({ ...dry, depth: 0.3 })).toBe(false);
    expect(swimmingState({ ...dry, bodyY: 2.2 })).toBe(false);
    expect(swimmingState({ ...dry, inLake: false })).toBe(false);
    expect(swimmingState({ ...dry, occupied: true })).toBe(false);
    expect(swimmingState({ ...dry, indoors: true })).toBe(false);
  });
  it("uses hysteresis at the shallows so the character can return to walking", () => {
    expect(swimmingState({ ...dry, swimming: true, depth: 0.5 })).toBe(true);
    expect(swimmingState({ ...dry, swimming: false, depth: 0.5 })).toBe(false);
    expect(swimmingState({ ...dry, swimming: true, depth: 0.3 })).toBe(false);
  });
  it("accelerates, slows down and floats toward the surface without a jump impulse", () => {
    const v = { x: 0, y: 0, z: 0 };
    const start = swimVelocity({
      velocity: v,
      direction: { x: 1, z: 1 },
      bodyY: -0.2,
      groundY: -1.1,
      time: 0,
      dt: 1 / 60,
    });
    expect(start.x).toBeGreaterThan(0);
    expect(start.x).toBeCloseTo(start.z);
    expect(start.y).toBeGreaterThan(0);
    const rest = swimVelocity({
      velocity: { x: 2, y: 0, z: 0 },
      direction: { x: 0, z: 0 },
      bodyY: LAKE_LEVEL + 0.5,
      groundY: -1.1,
      time: 0,
      dt: 1 / 60,
    });
    expect(rest.x).toBeLessThan(2);
    expect(rest.y).toBeCloseTo(0);
    const exit = swimVelocity({
      velocity: v,
      direction: { x: 0, z: 0 },
      bodyY: 0.2,
      groundY: -0.25,
      time: 0,
      dt: 1 / 60,
    });
    expect(exit.y).toBeGreaterThan(0);
  });
});
