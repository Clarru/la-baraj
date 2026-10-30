import { describe, expect, it } from "vitest";
import { lightingAt } from "./day-night";
import { BOAT_TUNING } from "./boat-motion";
import { spraySize, sprayIntensity } from "./boat-spray.ts";

const cruise = BOAT_TUNING.cruise;

describe("boat jet stream", () => {
  it("shows nothing below 0.5 m/s", () => {
    for (const speed of [0, 0.2, 0.49, -0.3])
      expect(spraySize(speed, cruise)).toEqual({
        length: 0,
        width: 0,
        opacity: 0,
      });
  });

  it("grows monotonically with speed, either direction", () => {
    let previous = spraySize(0, cruise);
    for (let speed = 0.05; speed <= 14; speed += 0.05) {
      const size = spraySize(speed, cruise);
      expect(size.length).toBeGreaterThanOrEqual(previous.length);
      expect(size.width).toBeGreaterThanOrEqual(previous.width);
      expect(size.opacity).toBeGreaterThanOrEqual(previous.opacity);
      expect(size.opacity).toBeLessThanOrEqual(1);
      previous = size;
    }
    expect(spraySize(-2, cruise)).toEqual(spraySize(2, cruise));
    expect(spraySize(cruise, cruise).length).toBeGreaterThan(0);
  });

  it("reads clearly bigger at boost", () => {
    const atCruise = spraySize(cruise, cruise);
    const boosted = spraySize(cruise * 1.6, cruise);
    expect(boosted.length).toBeGreaterThanOrEqual(atCruise.length * 1.35);
    expect(boosted.length).toBeLessThanOrEqual(atCruise.length * 1.6);
    expect(boosted.width).toBeGreaterThanOrEqual(atCruise.width * 1.35);
  });

  it("is dimmer at night", () => {
    const night = sprayIntensity(lightingAt(1));
    const day = sprayIntensity(lightingAt(12));
    expect(night).toBeLessThan(day);
    expect(night).toBeGreaterThan(0);
    expect(day).toBeLessThanOrEqual(1);
  });

  it("ignores non-finite speed", () => {
    expect(spraySize(NaN, cruise).opacity).toBe(0);
    expect(spraySize(Infinity, cruise).opacity).toBe(0);
  });
});

it("writes into a reused target without allocating", () => {
  const target = spraySize(0, cruise);
  expect(spraySize(cruise, cruise, target)).toBe(target);
  expect(target).toEqual(spraySize(cruise, cruise));
  spraySize(0.1, cruise, target);
  expect(target).toEqual({ length: 0, width: 0, opacity: 0 });
});
