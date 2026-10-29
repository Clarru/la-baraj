import { describe, expect, it } from "vitest";
import {
  BOAT_TUNING,
  advanceBoat,
  boatVelocity,
  boatWheelTarget,
  createBoatMotionState,
  inferBoatTurnRate,
  reconcileBoatSpeed,
} from "./boat-motion";
import { LAKE_LEVEL } from "./swim-motion";

const DT = 1 / 60;

function run(
  state: ReturnType<typeof createBoatMotionState>,
  steps: number,
  throttle: -1 | 0 | 1,
  steer: number,
  dt = DT,
) {
  for (let i = 0; i < steps; i += 1)
    advanceBoat(state, { throttle, steer, dt });
}

describe("boat motion", () => {
  it("accelerates to an 8 m/s cruise and coasts down slowly", () => {
    const state = createBoatMotionState(0);
    for (let i = 0; i < 600; i += 1) {
      advanceBoat(state, { throttle: 1, steer: 0, dt: DT });
      expect(state.speed).toBeLessThanOrEqual(BOAT_TUNING.cruise);
    }
    expect(Math.abs(state.speed - 8)).toBeLessThan(0.05);
    let previous = state.speed;
    for (let i = 0; i < 60; i += 1) {
      advanceBoat(state, { throttle: 0, steer: 0, dt: DT });
      expect(state.speed).toBeLessThan(previous);
      previous = state.speed;
    }
    expect(state.speed).toBeGreaterThan(6);
  });

  it("S slows a moving boat then reverses gently", () => {
    const state = createBoatMotionState(0);
    state.speed = 8;
    run(state, 120, -1, 0);
    expect(state.speed).toBeLessThanOrEqual(0);
    run(state, 480, -1, 0);
    expect(state.speed).toBeGreaterThanOrEqual(-2 - 1e-9);
    expect(state.speed).toBeLessThan(-1.5);
  });

  it("turns only while moving and slower than the scooter", () => {
    const rest = createBoatMotionState(0.3);
    run(rest, 60, 0, 1);
    expect(rest.yaw).toBe(0.3);
    expect(rest.turnRate).toBe(0);

    const moving = createBoatMotionState(0);
    moving.speed = 8;
    for (let i = 0; i < 300; i += 1) {
      advanceBoat(moving, { throttle: 1, steer: 1, dt: DT });
      expect(moving.turnRate).toBeLessThan(1.65);
    }
    expect(moving.turnRate).toBeCloseTo(0.9, 2);
  });

  it("wheel follows the actual turn rate, not the key", () => {
    const rest = createBoatMotionState(0);
    run(rest, 60, 0, 1);
    expect(Math.abs(rest.wheelAngle)).toBeLessThan(0.01);

    const moving = createBoatMotionState(0);
    moving.speed = 8;
    run(moving, 300, 1, 1);
    expect(moving.wheelAngle).toBeCloseTo(boatWheelTarget(0.9), 2);
    expect(boatWheelTarget(0.9)).toBeCloseTo(2.4, 9);
    expect(boatWheelTarget(-0.45)).toBeCloseTo(-1.2, 9);
    expect(boatWheelTarget(5)).toBe(2.4);
  });

  it("leans into turns, bounded", () => {
    const left = createBoatMotionState(0);
    left.speed = 8;
    run(left, 300, 1, 1);
    expect(left.lean).toBeGreaterThan(0);
    expect(left.lean).toBeLessThanOrEqual(BOAT_TUNING.leanMax);

    const right = createBoatMotionState(0);
    right.speed = 8;
    run(right, 300, 1, -1);
    expect(right.lean).toBeLessThan(0);

    const rest = createBoatMotionState(0);
    run(rest, 120, 0, 1);
    expect(rest.lean).toBeCloseTo(0, 6);
  });

  it("reverse steers the expected way", () => {
    const state = createBoatMotionState(0);
    state.speed = -2;
    run(state, 60, -1, 1);
    expect(state.turnRate).toBeLessThan(0);
  });

  it("ignores non-finite input and clamps dt spikes", () => {
    const state = createBoatMotionState(0);
    state.speed = 5;
    advanceBoat(state, { throttle: 1, steer: Infinity, dt: NaN });
    advanceBoat(state, { throttle: 1, steer: NaN, dt: Infinity });
    for (const value of Object.values(state)) {
      expect(Number.isFinite(value)).toBe(true);
    }

    const spike = createBoatMotionState(0);
    const clamped = createBoatMotionState(0);
    spike.speed = clamped.speed = 3;
    advanceBoat(spike, { throttle: 1, steer: 1, dt: 5 });
    advanceBoat(clamped, { throttle: 1, steer: 1, dt: 0.05 });
    expect(spike).toEqual(clamped);
  });

  it("blocked boats lose commanded speed", () => {
    expect(reconcileBoatSpeed(8, 0.4)).toBe(0.4);
    expect(reconcileBoatSpeed(8, 7.8)).toBe(8);
    expect(reconcileBoatSpeed(-2, -0.1)).toBe(-0.1);
    expect(reconcileBoatSpeed(0, 3)).toBe(0);
  });

  it("floats at ride height without ground clamping", () => {
    const ride = LAKE_LEVEL + BOAT_TUNING.rideHeight;
    const level = boatVelocity({
      yaw: 0,
      speed: 8,
      velocityY: 0,
      bodyY: ride,
      time: 0,
      dt: DT,
    });
    expect(level.z).toBeCloseTo(8, 6);
    expect(level.x).toBeCloseTo(0, 6);
    expect(Math.abs(level.y)).toBeLessThan(0.2);

    const high = boatVelocity({
      yaw: 0,
      speed: 8,
      velocityY: 0,
      bodyY: ride + 1,
      time: 0,
      dt: DT,
    });
    expect(high.y).toBeLessThan(0);

    const side = boatVelocity({
      yaw: Math.PI / 2,
      speed: 8,
      velocityY: 0,
      bodyY: ride,
      time: 0,
      dt: DT,
    });
    expect(side.x).toBeCloseTo(8, 6);
  });

  it("infers turn rate across the ±π seam", () => {
    const seam = inferBoatTurnRate(3.13, -3.13, 0.1);
    expect(seam).toBeCloseTo((2 * Math.PI - 6.26) / 0.1, 6);
    expect(seam).toBeGreaterThan(0);
    expect(seam).toBeLessThan(1);
    expect(inferBoatTurnRate(0, 0.09, 0.1)).toBeCloseTo(0.9, 6);
    expect(inferBoatTurnRate(0, 0.09, 0)).toBe(0);
  });
});
