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
  it.each(["top-weekend-knit", "top-trail-overshirt"])(
    "keeps %s within the approved character's measured chest depth",
    async (id) => {
      const { NodeIO } = await import("@gltf-transform/core");
      const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
      const bytes = await readFile(
        new URL(
          "../public/assets/avatars/wardrobe/" + id + ".glb",
          import.meta.url,
        ),
      );
      const doc = await new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .readBinary(bytes);
      const section: number[] = [];
      for (const mesh of doc.getRoot().listMeshes())
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute("POSITION")!;
          for (let index = 0; index < position.getCount(); index++) {
            const point = position.getElement(index, []);
            if (Math.abs(point[0]) < 0.04 && point[1] > 1.32 && point[1] < 1.4)
              section.push(point[2]);
          }
        }
      expect(section.length).toBeGreaterThan(20);
      // Approved workshirt front/back are approximately +.105/-.140 m.
      // Permit cloth ease, while rejecting the previous +.139/-.197 m barrel.
      expect(Math.max(...section)).toBeLessThan(0.125);
      expect(Math.min(...section)).toBeGreaterThan(-0.155);
    },
  );
  it.each(["top-weekend-knit", "top-trail-overshirt"])(
    "keeps %s outside the original trouser waistband at the rear",
    async (id) => {
      const { NodeIO } = await import("@gltf-transform/core");
      const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
      const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
      async function rearAtWaist(asset: string) {
        const doc = await io.readBinary(
          await readFile(
            new URL(
              "../public/assets/avatars/wardrobe/" + asset + ".glb",
              import.meta.url,
            ),
          ),
        );
        const values: number[] = [];
        for (const mesh of doc.getRoot().listMeshes())
          for (const primitive of mesh.listPrimitives()) {
            const position = primitive.getAttribute("POSITION")!;
            for (let i = 0; i < position.getCount(); i++) {
              const p = position.getElement(i, []);
              if (Math.abs(p[0]) < 0.05 && p[1] >= 0.98 && p[1] <= 1.04)
                values.push(p[2]);
            }
          }
        expect(values.length).toBeGreaterThan(5);
        return Math.min(...values);
      }
      expect(await rearAtWaist(id)).toBeLessThan(
        (await rearAtWaist("bottom-classic-full")) - 0.002,
      );
    },
  );
  it("retains the rib's fabric UVs after joining it with the knit atlas", async () => {
    const { NodeIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
    const doc = await new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .readBinary(
        await readFile(
          new URL(
            "../public/assets/avatars/wardrobe/top-weekend-knit.glb",
            import.meta.url,
          ),
        ),
      );
    const rib = doc
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives())
      .find(
        (primitive) =>
          primitive.getMaterial()?.getName() ===
          "Wardrobe_Knit_Charcoal_Fitted_Rib",
      );
    expect(rib).toBeDefined();
    const material = rib!.getMaterial()!;
    expect(material.getBaseColorTexture()).not.toBeNull();
    expect(material.getNormalTexture()).not.toBeNull();
    const channel = material.getBaseColorTextureInfo()!.getTexCoord();
    expect(material.getNormalTextureInfo()!.getTexCoord()).toBe(channel);
    const uv = rib!.getAttribute("TEXCOORD_" + channel)!;
    expect(uv).toBeDefined();
    const indices = rib!.getIndices(),
      u: number[] = [],
      v: number[] = [];
    for (let i = 0; i < (indices?.getCount() ?? uv.getCount()); i++) {
      const index = indices ? indices.getElement(i, [])[0] : i;
      const point = uv.getElement(index, []);
      u.push(point[0]);
      v.push(point[1]);
    }
    // A missing FabricUV layer previously sampled one flat atlas corner.
    expect(Math.max(...u) - Math.min(...u)).toBeGreaterThan(1);
    expect(Math.max(...v) - Math.min(...v)).toBeGreaterThan(0.05);
  });
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
    // Footwear replacement must retain the publisher eyeballs as visible geometry.
    const eyes = doc
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives())
      .filter((primitive) =>
        primitive.getMaterial()?.getName().startsWith("MI_Eyes"),
      );
    expect(eyes.length).toBeGreaterThan(0);
    expect(
      eyes.reduce(
        (count, primitive) =>
          count + primitive.getAttribute("POSITION")!.getCount(),
        0,
      ),
    ).toBeGreaterThan(100);
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
