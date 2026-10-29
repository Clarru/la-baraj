import { describe, expect, it, vi } from "vitest";
import {
  formatGameTime,
  GAME_DAY_MS,
  gameMinutes,
  lightingAt,
  syncWorldTime,
  worldNow,
} from "./day-night";

describe("shared game day", () => {
  it("uses a 60 minute cycle and wraps at midnight", () => {
    expect(formatGameTime(0)).toBe("00:00");
    expect(formatGameTime(GAME_DAY_MS / 2)).toBe("12:00");
    expect(formatGameTime(GAME_DAY_MS - 1)).toBe("23:59");
    expect(formatGameTime(GAME_DAY_MS)).toBe("00:00");
    expect(gameMinutes(-1)).toBe(1439);
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
