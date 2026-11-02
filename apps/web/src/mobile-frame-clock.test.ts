import { describe, expect, it } from "vitest";
import { createMobileFrameClock, mobilePixelRatio } from "./mobile-frame-clock";
describe("mobile work budget", () => {
  it.each([60, 90, 120, 144])(
    "keeps 60 simulation steps and 30 draws per second on a %s Hz display",
    (hz) => {
      const clock = createMobileFrameClock();
      let steps = 0,
        draws = 0;
      for (let frame = 0; frame <= hz * 10; frame++) {
        const sample = clock.next((frame * 1000) / hz);
        steps += sample.steps;
        draws += Number(sample.draw);
      }
      expect(steps).toBeGreaterThanOrEqual(599);
      expect(steps).toBeLessThanOrEqual(602);
      expect(draws).toBeGreaterThanOrEqual(299);
      expect(draws).toBeLessThanOrEqual(302);
    },
  );
  it("bounds catch-up after a stall and resumes without a background time jump", () => {
    const clock = createMobileFrameClock();
    clock.next(0);
    expect(clock.next(60000).steps).toBeLessThanOrEqual(3);
    clock.reset();
    expect(clock.next(120000)).toEqual({ steps: 1, draw: true });
  });
  it("bounds drawing pixels independently of retina scale and tablet size", () => {
    expect(mobilePixelRatio(393, 852)).toBeLessThanOrEqual(1.25);
    expect(393 * 852 * mobilePixelRatio(393, 852) ** 2).toBeLessThanOrEqual(
      520000.01,
    );
    const ratio = mobilePixelRatio(1366, 1024);
    expect(1366 * 1024 * ratio ** 2).toBeCloseTo(520000);
    expect(ratio).toBeLessThan(1.25);
  });
});
