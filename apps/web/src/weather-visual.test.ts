import { expect, it } from "vitest";
import {
  cloudiness,
  cloudinessForWeather,
  setWorldWeather,
} from "./weather-visual";
const sample = { cloudCover: 100, weatherCode: 3, observedAt: 1, fetchedAt: 1 };
it("smoothly blends shared weather and returns to neutral on unavailable data", () => {
  setWorldWeather(null, 0);
  setWorldWeather(sample, 0);
  expect(cloudiness(0)).toBe(0);
  expect(cloudiness(12500)).toBeCloseTo(0.5);
  expect(cloudiness(25000)).toBe(1);
  setWorldWeather(null, 25000);
  expect(cloudiness(37500)).toBeCloseTo(0.5);
  expect(cloudiness(50000)).toBe(0);
  expect(
    cloudinessForWeather({ ...sample, cloudCover: 10, weatherCode: 61 }),
  ).toBeGreaterThanOrEqual(0.75);
});
