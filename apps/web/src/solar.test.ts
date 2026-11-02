import { describe, expect, it } from "vitest";
import { solarDay, solarPaletteHour, solarPosition } from "./solar";
describe("Lake Cinciș seasonal daylight", () => {
  it("has winter darkness and summer daylight at the same Romanian clock hour", () => {
    const winter = solarDay(Date.parse("2026-12-15T12:00:00Z")),
      summer = solarDay(Date.parse("2026-06-15T12:00:00Z"));
    expect(winter.sunset).toBeGreaterThan(16.5);
    expect(winter.sunset).toBeLessThan(17);
    expect(summer.sunset).toBeGreaterThan(21);
    expect(summer.sunset).toBeLessThan(21.6);
    expect(solarPosition(17.5, winter).elevation).toBeLessThan(-6);
    expect(solarPosition(17.5, summer).elevation).toBeGreaterThan(30);
    expect(solarPaletteHour(17.5, winter)).toBeGreaterThan(21);
    expect(solarPaletteHour(17.5, summer)).toBeLessThan(17);
  });
  it("computes all twelve months, including Romanian summer time", () => {
    const now = Date.parse("2026-11-02T12:00:00Z");
    for (let month = 1; month <= 12; month++) {
      const d = solarDay(now, month);
      expect(d.dawn).toBeLessThan(d.sunrise);
      expect(d.sunrise).toBeLessThan(d.noon);
      expect(d.noon).toBeLessThan(d.sunset);
      expect(d.sunset).toBeLessThan(d.dusk);
      expect(solarPosition(d.noon, d).elevation).toBeGreaterThan(15);
      expect(solarPaletteHour(d.sunset, d)).toBeCloseTo(19);
      expect(solarPaletteHour(d.dusk, d)).toBeCloseTo(21);
    }
    expect(solarDay(now, 1).noon).toBeLessThan(13);
    expect(solarDay(now, 7).noon).toBeGreaterThan(13);
  });
  it("uses the Romanian civil date at UTC midnight boundaries and daylight-saving changes", () => {
    const before = solarDay(Date.parse("2026-03-28T12:00:00Z")),
      after = solarDay(Date.parse("2026-03-29T12:00:00Z"));
    expect(after.noon - before.noon).toBeGreaterThan(0.9);
    expect(
      new Date(solarDay(Date.parse("2026-11-02T23:30:00Z")).date).getUTCDate(),
    ).toBe(3);
    expect(solarPaletteHour(24, before)).toBe(solarPaletteHour(0, before));
    expect(
      Number.isFinite(
        solarPosition(12, solarDay(Date.parse("2028-02-29T12:00:00Z")))
          .elevation,
      ),
    ).toBe(true);
  });
});
