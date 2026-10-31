import { expect, it } from "vitest";
import { Color } from "three";
import { lightingAt } from "./day-night";
import { mobileWaterReflection } from "./mobile-water";
it("reuses one tiny reflection while following night and local override colours", () => {
  const day = lightingAt(12).colors,
    night = lightingAt(0).colors;
  const texture = mobileWaterReflection(day.sky, day.horizon);
  const brightness = () =>
    Array.from(texture.image.data as Uint8Array)
      .filter((_, i) => i % 4 !== 3)
      .reduce((a, b) => a + b, 0);
  const before = brightness();
  expect(texture.image.width).toBe(32);
  expect(texture.image.height).toBe(32);
  expect(mobileWaterReflection(night.sky, night.horizon)).toBe(texture);
  expect(brightness()).toBeLessThan(before);
  mobileWaterReflection(new Color(0.2, 0.1, 0.05), new Color(0.1, 0.2, 0.3));
  expect(Array.from((texture.image.data as Uint8Array).slice(0, 4))).toEqual([
    26, 51, 77, 255,
  ]);
});
