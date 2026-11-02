import { afterEach, expect, it, vi } from "vitest";
import {
  readAppearancePreference,
  saveAppearancePreference,
} from "./appearance-preference";

afterEach(() => vi.unstubAllGlobals());
it("ignores corrupt and future preferences instead of resetting a server-owned profile", () => {
  for (const text of [
    "not JSON",
    '{"version":2,"body":"female"}',
    "null",
    "[]",
  ]) {
    vi.stubGlobal("localStorage", { getItem: () => text });
    expect(readAppearancePreference()).toBeNull();
  }
});
it("stores only normalized cosmetic IDs and safely tolerates storage denial", () => {
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", {
    setItem,
    getItem: () =>
      JSON.stringify({ version: 1, body: "female", url: "/custom.glb" }),
  });
  expect(readAppearancePreference()).toEqual({ version: 1, body: "female" });
  expect(saveAppearancePreference({ version: 1, body: "female" })).toBe(true);
  expect(setItem.mock.calls[0][1]).toBe('{"version":1,"body":"female"}');
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error("denied");
    },
    setItem: () => {
      throw Error("denied");
    },
  });
  expect(readAppearancePreference()).toBeNull();
  expect(saveAppearancePreference({ version: 1, body: "female" })).toBe(false);
});
