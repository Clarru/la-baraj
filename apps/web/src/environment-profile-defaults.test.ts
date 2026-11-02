import { expect, it } from "vitest";
import type { DialConfig } from "dialkit";
import {
  applyAuthoredProfileDefaults,
  authoredProfileHour,
} from "./environment-profile-defaults";
it("updates the intended recipe defaults while retaining native slider ranges and pad/action types", () => {
  const config = {
    enabled: false,
    clock: { hour: [12, 0, 23.99, 0.01] },
    light: {
      sun: [0.65, 0, 3, 0.01],
      sunPosition: { type: "pad", x: [0, -180, 180, 1], y: [49, 2, 90, 1] },
    },
    reference: { image: { type: "image" } },
    reset: { type: "action", label: "Reset this condition" },
  } satisfies DialConfig;
  applyAuthoredProfileDefaults(config, {
    time: "goldenHour",
    weather: "clear",
  });
  expect(config.light.sun[0]).toBe(0.65);
  applyAuthoredProfileDefaults(config, { time: "goldenHour", weather: "mist" });
  expect(config.enabled).toBe(true);
  expect(config.clock.hour).toEqual([16.5, 0, 23.99, 0.01]);
  expect(config.light.sun).toEqual([0.3, 0, 3, 0.01]);
  expect(config.light.sunPosition.x).toEqual([-62, -180, 180, 1]);
  expect(config.light.sunPosition.y).toEqual([6, 2, 90, 1]);
  expect(config.reference.image).toEqual({ type: "image", default: "" });
  expect(config.reset).toEqual({
    type: "action",
    label: "Reset this condition",
  });
  expect(authoredProfileHour({ time: "goldenHour", weather: "mist" })).toBe(
    16.5,
  );
  expect(
    authoredProfileHour({ time: "dawn", weather: "mist" }),
  ).toBeUndefined();
});
