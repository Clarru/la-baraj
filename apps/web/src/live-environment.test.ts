import { afterEach, expect, it, vi } from "vitest";
import { liveEnvironment } from "./live-environment";
import { currentLighting, lightingAt, worldNow } from "./day-night";
import { solarDay, solarPaletteHour } from "./solar";
import { cloudiness, fogPresence, setWorldWeather } from "./weather-visual";
import {
  environmentDefaults,
  setEnvironmentTuning,
} from "./environment-tuning";
afterEach(() => {
  setEnvironmentTuning(null);
  vi.restoreAllMocks();
});
it("uses only approved rendering fields for golden-hour fog, with smooth phase boundaries", () => {
  const approved = liveEnvironment(17.5, 1);
  expect(approved.light.sun).toBeCloseTo(0.3);
  expect(approved.light.hemisphere).toBeCloseTo(0.6);
  expect(approved.light.ambient).toBeCloseTo(0.9);
  expect(approved.light.exposure).toBeCloseTo(0.71);
  expect(approved.atmosphere.fogNear).toBe(20);
  expect(approved.atmosphere.fogFar).toBe(360);
  expect(approved.water.distortion).toBe(0.3);
  for (const name of ["clock", "weather", "reference", "enabled"])
    expect(Object.hasOwn(approved, name)).toBe(false);
  for (const phase of [0, 5, 12, 16, 17, 19, 21, 24])
    expect(liveEnvironment(phase, 1).light.sun).toBe(1);
  expect(liveEnvironment(17.5, 0).light.exposure).toBe(0.92);
  expect(liveEnvironment(17.00001, 1).light.sun).toBeCloseTo(1, 6);
  expect(liveEnvironment(18.99999, 1).light.sun).toBeCloseTo(1, 6);
  const half = liveEnvironment(17.125, 1);
  expect(half.light.sun).toBeCloseTo(0.65);
});
it("follows real weather and solar time, preserves local overrides, and exits fog even when cloud cover is unchanged", () => {
  const now = Date.parse("2026-11-02T14:30:00Z"); // 16:30 Romanian golden hour.
  const date = vi.spyOn(Date, "now").mockReturnValue(now);
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  const weather = {
    cloudCover: 100,
    weatherCode: 45,
    observedAt: now,
    fetchedAt: now,
  };
  setWorldWeather(weather, 0);
  clock.mockReturnValue(25000);
  expect(fogPresence()).toBe(1);
  expect(worldNow()).toBe(now);
  let light = currentLighting();
  expect(light.renderSettings?.light.exposure).toBeCloseTo(0.71);
  const phase = solarPaletteHour(16.5, solarDay(now));
  expect(light.sunIntensity).toBeCloseTo(
    lightingAt(phase).sunIntensity * 0.5 * 0.3,
  );
  expect(cloudiness()).toBe(1); // Keep real cloud coverage, do not force preview0.8.
  const local = structuredClone(environmentDefaults);
  local.enabled = true;
  local.clock.hour = 16.5;
  local.light.sun = 2;
  setEnvironmentTuning(local);
  expect(currentLighting().renderSettings?.light.sun).toBe(2);
  setEnvironmentTuning(null);
  date.mockReturnValue(Date.parse("2026-11-02T20:00:00Z"));
  expect(currentLighting().renderSettings?.light.exposure).toBe(0.92);
  date.mockReturnValue(now);
  setWorldWeather({ ...weather, weatherCode: 3 }, 25000); // Same100% cover, no fog.
  clock.mockReturnValue(37500);
  expect(fogPresence()).toBeCloseTo(0.5);
  expect(currentLighting().renderSettings?.light.sun).toBeCloseTo(0.65);
  clock.mockReturnValue(50000);
  light = currentLighting();
  expect(light.renderSettings?.light.sun).toBe(1);
  expect(light.renderSettings?.atmosphere.fogFar).toBe(3300);
  setWorldWeather(null, 50000);
  clock.mockReturnValue(75000);
  expect(cloudiness()).toBe(0);
  expect(fogPresence()).toBe(0);
  expect(currentLighting().renderSettings?.light.sun).toBe(1);
});
