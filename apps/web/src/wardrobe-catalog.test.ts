import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, HAIR_IDS, HAT_IDS, TOP_IDS, BOTTOM_IDS, SHOE_IDS } from "../../../packages/shared/appearance";
import { WARDROBE_ASSETS, wardrobeAssetIds } from "./wardrobe-catalog";

describe("selected wardrobe downloads and garment fit", () => {
  it("does not download a wardrobe catalogue for the default actor", () => {
    expect(wardrobeAssetIds(DEFAULT_APPEARANCE)).toEqual([]);
    expect(wardrobeAssetIds({ version: 1, body: "female" })).toEqual(["female-brunette-tailored"]);
  });

  it("selects the leg coverage matching high boots, ankle boots or low shoes", () => {
    const appearance = { ...DEFAULT_APPEARANCE, bottom: "weekend-shorts" as const };
    expect(wardrobeAssetIds(appearance)).toContain("bottom-weekend-shorts-tucked");
    expect(wardrobeAssetIds({ ...appearance, shoes: "trail-hikers" })).toContain("bottom-weekend-shorts-ankle");
    expect(wardrobeAssetIds({ ...appearance, shoes: "canvas-low" })).toContain("bottom-weekend-shorts");
  });

  it("loads each replacement once and only allowlisted assets for every combination", () => {
    for (const hair of HAIR_IDS)
      for (const hat of HAT_IDS)
        for (const top of TOP_IDS)
          for (const bottom of BOTTOM_IDS)
            for (const shoes of SHOE_IDS) {
              const ids = wardrobeAssetIds({ ...DEFAULT_APPEARANCE, hair, hat, top, bottom, shoes });
              expect(new Set(ids).size).toBe(ids.length);
              expect(ids.length).toBeLessThanOrEqual(7);
              for (const id of ids) expect(WARDROBE_ASSETS).toContain(id);
            }
  });
});
