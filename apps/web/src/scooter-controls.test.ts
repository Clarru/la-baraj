import { describe, it, expect } from "vitest";
import {
  scooterDriveInput,
  scooterHeading,
  scooterSpeed,
  scooterSteeringInput,
} from "./scooter-controls";
describe("scooter controls", () => {
  it("maps A to left and D to right for the +Z-forward scooter", () => {
    expect(scooterSteeringInput(true, false)).toBe(1);
    expect(scooterSteeringInput(false, true)).toBe(-1);
    expect(scooterSteeringInput(true, true)).toBe(0);
    expect(
      scooterHeading(0, scooterSteeringInput(false, true), 10, 0.02),
    ).toBeLessThan(0);
  });
  it("has faster cruise than the existing 6.5m/s run", () =>
    expect(scooterSpeed.cruise).toBeGreaterThan(6.5));
  it("turns left/right under travel but does not spin at rest", () => {
    expect(scooterHeading(0, 1, 10, 0.02)).toBeGreaterThan(0);
    expect(scooterHeading(0, -1, 10, 0.02)).toBeLessThan(0);
    expect(scooterHeading(1, 1, 0, 0.02)).toBe(1);
  });
  it("bounds steering over a stalled frame and ignores invalid values", () => {
    expect(scooterHeading(0, 99, 10, 100)).toBeCloseTo(0.0825);
    expect(scooterHeading(1, NaN, 3, 0.02)).toBe(1);
  });
});

describe("scooter direction changes", () => {
  it("reverses from rest, with a slower speed cap", () => {
    expect(scooterDriveInput(0, false, true)).toEqual({
      throttle: -1,
      braking: false,
      reversing: true,
    });
    expect(scooterSpeed.reverse).toBeLessThan(3.8);
  });
  it("brakes forward travel before S engages reverse", () => {
    expect(scooterDriveInput(8, false, true)).toEqual({
      throttle: 0,
      braking: true,
      reversing: false,
    });
    expect(scooterDriveInput(0.1, false, true).throttle).toBe(-1);
  });
  it("brakes reverse travel before W engages forward", () => {
    expect(scooterDriveInput(-2, true, false)).toEqual({
      throttle: 0,
      braking: true,
      reversing: true,
    });
    expect(scooterDriveInput(-0.1, true, false).throttle).toBe(1);
  });
  it("holds the brake for opposite keys and releases the motor with no keys", () => {
    expect(scooterDriveInput(0, true, true).throttle).toBe(0);
    expect(scooterDriveInput(-2, true, true).braking).toBe(true);
    expect(scooterDriveInput(-2, false, false).throttle).toBe(0);
    expect(scooterDriveInput(0, false, false).reversing).toBe(false);
    expect(scooterDriveInput(NaN, false, true).throttle).toBe(0);
  });
  it("reverses the steering yaw while keeping the handlebar input consistent", () => {
    expect(scooterHeading(0, 1, -2, 0.02)).toBeLessThan(0);
    expect(scooterHeading(0, -1, -2, 0.02)).toBeGreaterThan(0);
    expect(scooterHeading(0, 1, 0, 0.02)).toBe(0);
  });
});
