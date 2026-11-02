import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  appearanceKey,
  HAIR_IDS,
  HAT_IDS,
  TOP_IDS,
  BOTTOM_IDS,
  SHOE_IDS,
} from "../../../packages/shared/appearance";

describe("bounded appearance profile", () => {
  it("keeps old hat colours unchanged and accepts only bounded new dyes", () => {
    const { hatColor: _oldMissing, ...old } = DEFAULT_APPEARANCE;
    expect(normalizeAppearance(old)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ ...old, hatColor: "#fff" })).toEqual(
      DEFAULT_APPEARANCE,
    );
    const dyed = {
      ...DEFAULT_APPEARANCE,
      hat: "panel-cap" as const,
      hatColor: "cream" as const,
    };
    expect(normalizeAppearance(dyed)).toEqual(dyed);
    expect(appearanceKey(dyed)).not.toBe(
      appearanceKey({ ...dyed, hatColor: "original" }),
    );
  });
  it("preserves approved appearance for old and future profiles", () => {
    for (const value of [
      undefined,
      null,
      [],
      "female",
      {},
      { version: 2, body: "female" },
    ])
      expect(normalizeAppearance(value)).toEqual(DEFAULT_APPEARANCE);
    const first = normalizeAppearance(undefined);
    expect(first).not.toBe(DEFAULT_APPEARANCE);
  });

  it("drops paths, arbitrary colours and extra fields while preserving valid choices", () => {
    const result = normalizeAppearance({
      ...DEFAULT_APPEARANCE,
      top: "weekend-knit",
      shoes: "https://example.test/avatar.glb",
      hairColor: "#ff0000",
      geometry: "/private/mesh.glb",
      hat: { id: "panel-cap" },
    });
    expect(result).toEqual({
      ...DEFAULT_APPEARANCE,
      top: "weekend-knit",
    });
    expect(JSON.stringify(result)).not.toContain("example");
    expect(JSON.stringify(result)).not.toContain("geometry");
  });

  it("canonicalizes the single female preset independently of men's settings", () => {
    expect(
      normalizeAppearance({
        ...DEFAULT_APPEARANCE,
        body: "female",
        hairColor: "blond",
      }),
    ).toEqual({ version: 1, body: "female" });
  });

  it("represents all 243 modeled men's combinations within the packet budget", () => {
    const keys = new Set<string>();
    for (const hair of HAIR_IDS)
      for (const hat of HAT_IDS.filter((id) => id !== "none"))
        for (const top of TOP_IDS)
          for (const bottom of BOTTOM_IDS)
            for (const shoes of SHOE_IDS) {
              const value = {
                ...DEFAULT_APPEARANCE,
                hair,
                hat,
                top,
                bottom,
                shoes,
              };
              const normalized = normalizeAppearance(value);
              expect(normalized).toEqual(value);
              const key = appearanceKey(normalized);
              expect(key.length).toBeLessThan(400);
              keys.add(key);
            }
    expect(keys.size).toBe(243);
  });
});
