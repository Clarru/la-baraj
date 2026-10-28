import { describe, it, expect } from "vitest";
import { scooterHeading, scooterSpeed } from "./scooter-controls";
describe("scooter controls", () => {
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
