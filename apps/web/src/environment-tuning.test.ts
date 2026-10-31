import { afterEach, describe, expect, it } from "vitest";
import { currentLighting, lightingAt } from "./day-night";
import {
  environmentDefaults,
  environmentHour,
  environmentTuning,
  fogRange,
  lightingColor,
  setEnvironmentTimelineHour,
  setEnvironmentTuning,
  weatherLooks,
} from "./environment-tuning";

afterEach(() => {
  setEnvironmentTuning(null);
  setEnvironmentTimelineHour(null);
});
const settings = () => structuredClone(environmentDefaults);

describe("local environment overrides", () => {
  it("keeps the live world unchanged until explicitly enabled", () => {
    const before = currentLighting(true);
    setEnvironmentTuning(settings());
    expect(environmentTuning()).toBeNull();
    expect(environmentHour()).toBeNull();
    const after = currentLighting(true);
    expect(after.sunIntensity).toBe(before.sunIntensity);
    expect(after.colors.sky.equals(before.colors.sky)).toBe(true);
  });
  it("invalidates the shared light sample immediately and restores it when disabled", () => {
    const live = currentLighting(true);
    const edited = settings();
    edited.enabled = true;
    edited.clock.hour = 12;
    edited.light.sun = 1.5;
    edited.weather.cloudCover = 1;
    setEnvironmentTuning(edited);
    const light = currentLighting(true);
    expect(light).not.toBe(live);
    expect(light.cloudCover).toBe(1);
    expect(light.sunIntensity).toBeCloseTo(
      lightingAt(12).sunIntensity * 0.5 * 1.5,
    );
    edited.enabled = false;
    setEnvironmentTuning(edited);
    expect(currentLighting(true).sunIntensity).toBe(live.sunIntensity);
    expect(currentLighting(true).colors.water.equals(live.colors.water)).toBe(
      true,
    );
  });
  it("uses the day timeline while mounted and resumes the chosen clock afterwards", () => {
    const edited = settings();
    edited.enabled = true;
    setEnvironmentTuning(edited);
    setEnvironmentTimelineHour(5.5);
    expect(environmentHour()).toBe(5.5);
    setEnvironmentTimelineHour(null);
    expect(environmentHour()).toBe(12);
    edited.clock.liveTime = true;
    setEnvironmentTuning(edited);
    expect(environmentHour()).toBeNull();
  });
  it("shares custom colors and a normalized manual sun direction across the scene", () => {
    const edited = settings();
    edited.enabled = true;
    edited.palette.customColors = true;
    edited.palette.water = "#ff5500";
    edited.light.manualSun = true;
    edited.light.sunPosition = { x: 90, y: 30 };
    setEnvironmentTuning(edited);
    const light = currentLighting();
    expect(light.colors.water.getHexString()).toBe("ff5500");
    expect(light.sunDirection.length()).toBeCloseTo(1);
    expect(light.sunDirection.y).toBeCloseTo(0.5);
    expect(light.sunDirection.x).toBeGreaterThan(0.8);
    expect(lightingColor("#ff5500").getHexString()).toBe("ff5500");
  });
  it("keeps fog valid at crossed bounds and defines weather moods with distinct visibility", () => {
    expect(fogRange(1000, 50)).toEqual({ near: 1000, far: 1001 });
    expect(fogRange(20, 360)).toEqual({ near: 20, far: 360 });
    expect(weatherLooks.mist.fogFar).toBeLessThan(weatherLooks.clear.fogFar);
    expect(weatherLooks.storm.sun).toBeLessThan(weatherLooks.overcast.sun);
    expect(weatherLooks.storm.distortion).toBeGreaterThan(
      weatherLooks.clear.distortion,
    );
  });
});
