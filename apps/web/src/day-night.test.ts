import { describe, expect, it, vi } from "vitest";
import {
  formatGameTime,
  gameMinutes,
  lightingAt,
  syncWorldTime,
  worldNow,
} from "./day-night";

describe("shared game day", () => {
  it("uses Romanian civil time with the right winter and summer offsets", () => {
    expect(formatGameTime(Date.parse("2026-01-15T10:05:00Z"))).toBe("12:05");
    expect(formatGameTime(Date.parse("2026-07-15T10:05:00Z"))).toBe("13:05");
    expect(gameMinutes(Date.parse("2026-01-15T22:00:00Z"))).toBe(0);
  });
  it("follows Romania's daylight-saving transition", () => {
    expect(formatGameTime(Date.parse("2026-03-29T00:59:00Z"))).toBe("02:59");
    expect(formatGameTime(Date.parse("2026-03-29T01:00:00Z"))).toBe("04:00");
    expect(formatGameTime(Date.parse("2026-10-25T00:59:00Z"))).toBe("03:59");
    expect(formatGameTime(Date.parse("2026-10-25T01:00:00Z"))).toBe("03:00");
  });
  it("uses server time to correct a skewed device clock", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(100);
    syncWorldTime(1234567);
    clock.mockReturnValue(2100);
    expect(worldNow()).toBe(1236567);
    clock.mockRestore();
  });
  it("provides distinct but navigable day and night and joins the loop smoothly", () => {
    const day = lightingAt(12),
      night = lightingAt(0),
      before = lightingAt(23.999);
    expect(day.sunIntensity).toBeGreaterThan(night.sunIntensity);
    expect(night.hemiIntensity).toBeGreaterThan(0.3);
    expect(day.colors.sky.getHex()).not.toBe(night.colors.sky.getHex());
    expect(before.colors.sky.r).toBeCloseTo(night.colors.sky.r, 3);
    expect(lightingAt(24).colors.fog.getHex()).toBe(night.colors.fog.getHex());
    expect(day.sunDirection.length()).toBeCloseTo(1);
  });
});
