import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  DEFAULT_APPEARANCE,
  HAIR_IDS,
  HAT_IDS,
  TOP_IDS,
  BOTTOM_IDS,
  SHOE_IDS,
} from "../../../packages/shared/appearance";
import {
  WARDROBE_ASSETS,
  wardrobeAssetIds,
  wardrobeAssetURL,
} from "./wardrobe-catalog";
import versions from "./wardrobe-asset-versions.json";

describe("selected wardrobe downloads and garment fit", () => {
  it("ships a tucked female top with no exposed abdominal skin geometry", async () => {
    const { NodeIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
    const bytes = await readFile(
      new URL(
        "../public/assets/avatars/wardrobe/female-brunette-tailored.glb",
        import.meta.url,
      ),
    );
    const doc = await new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .readBinary(bytes);
    const skin = doc
      .getRoot()
      .listNodes()
      .filter((node) => node.getExtras().wardrobeRole === "skin");
    expect(skin.length).toBeGreaterThan(0);
    for (const node of skin)
      for (const primitive of node.getMesh()!.listPrimitives())
        expect(
          primitive.getAttribute("POSITION")!.getMin([])[1],
        ).toBeGreaterThan(1.2);
    const top = doc
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives())
      .find(
        (primitive) =>
          primitive.getMaterial()?.getName() === "Wardrobe_Female_Black_Crop",
      );
    expect(top).toBeDefined();
    expect(top!.getAttribute("POSITION")!.getMin([])[1]).toBeLessThan(1.035);
  });
  it("serves each allowlisted export with a content version matching its actual bytes", async () => {
    for (const id of WARDROBE_ASSETS) {
      const bytes = await readFile(
        new URL(
          "../public/assets/avatars/wardrobe/" + id + ".glb",
          import.meta.url,
        ),
      );
      const sha = createHash("sha256").update(bytes).digest("hex");
      expect(versions[id]).toBe(sha);
      expect(wardrobeAssetURL(id)).toBe(
        "/assets/avatars/wardrobe/" + id + ".glb?v=" + sha.slice(0, 16),
      );
    }
  });
  it("uses a neutral albedo for classic trouser dyes while retaining the approved original at default", () => {
    expect(
      wardrobeAssetIds({ ...DEFAULT_APPEARANCE, bottomColor: "cream" }),
    ).toEqual(["bottom-classic-dyed-tucked"]);
    expect(
      wardrobeAssetIds({
        ...DEFAULT_APPEARANCE,
        bottomColor: "sage",
        shoes: "canvas-low",
      }),
    ).toContain("bottom-classic-dyed-full");
  });
  it("does not download a wardrobe catalogue for the default actor", () => {
    expect(wardrobeAssetIds(DEFAULT_APPEARANCE)).toEqual([]);
    expect(wardrobeAssetIds({ version: 1, body: "female" })).toEqual([
      "female-brunette-tailored",
    ]);
  });

  it("selects the leg coverage matching high boots, ankle boots or low shoes", () => {
    const appearance = {
      ...DEFAULT_APPEARANCE,
      bottom: "weekend-shorts" as const,
    };
    expect(wardrobeAssetIds(appearance)).toContain(
      "bottom-weekend-shorts-tucked",
    );
    expect(
      wardrobeAssetIds({ ...appearance, shoes: "trail-hikers" }),
    ).toContain("bottom-weekend-shorts-ankle");
    expect(wardrobeAssetIds({ ...appearance, shoes: "canvas-low" })).toContain(
      "bottom-weekend-shorts",
    );
  });

  it("loads each replacement once and only allowlisted assets for every combination", () => {
    for (const hair of HAIR_IDS)
      for (const hat of HAT_IDS)
        for (const top of TOP_IDS)
          for (const bottom of BOTTOM_IDS)
            for (const shoes of SHOE_IDS) {
              const ids = wardrobeAssetIds({
                ...DEFAULT_APPEARANCE,
                hair,
                hat,
                top,
                bottom,
                shoes,
              });
              expect(new Set(ids).size).toBe(ids.length);
              expect(ids.length).toBeLessThanOrEqual(7);
              for (const id of ids) expect(WARDROBE_ASSETS).toContain(id);
            }
  });
});
