import {
  normalizeAppearance,
  type Appearance,
} from "../../../packages/shared/appearance";
import versions from "./wardrobe-asset-versions.json";

/** Only this allowlist maps cosmetic IDs to shipped paths. */
export const WARDROBE_ASSETS = [
  "hair-buzzed",
  "hair-long",
  "beard-short",
  "beard-moustache",
  "hat-panel-cap",
  "hat-knit-beanie",
  "hat-stitched-bucket",
  "male-custom-top-skin",
  "top-trail-overshirt",
  "top-weekend-knit",
  "bottom-classic-full",
  "bottom-classic-ankle",
  "bottom-classic-dyed-full",
  "bottom-classic-dyed-ankle",
  "bottom-classic-dyed-tucked",
  "bottom-trail-cargo-full",
  "bottom-trail-cargo-ankle",
  "bottom-trail-cargo-tucked",
  "bottom-weekend-shorts",
  "bottom-weekend-shorts-ankle",
  "bottom-weekend-shorts-tucked",
  "shoes-trail-hikers",
  "shoes-canvas-low",
  "female-brunette-tailored",
] as const;
export type WardrobeAssetId = (typeof WARDROBE_ASSETS)[number];
export const wardrobeAssetURL = (id: WardrobeAssetId) =>
  "/assets/avatars/wardrobe/" + id + ".glb?v=" + versions[id].slice(0, 16);

/** Load only selected replacements. The original appearance requires no downloads. */
export function wardrobeAssetIds(value: Appearance): WardrobeAssetId[] {
  const appearance = normalizeAppearance(value);
  if (appearance.body === "female") return ["female-brunette-tailored"];
  const ids: WardrobeAssetId[] = [];
  if (appearance.hair !== "parted")
    ids.push(appearance.hair === "buzzed" ? "hair-buzzed" : "hair-long");
  if (appearance.beard === "short") ids.push("beard-short");
  if (appearance.beard === "moustache") ids.push("beard-moustache");
  if (appearance.hat !== "none")
    ids.push(("hat-" + appearance.hat) as WardrobeAssetId);
  if (appearance.top !== "lake-workshirt")
    ids.push(
      "male-custom-top-skin",
      appearance.top === "weekend-knit"
        ? "top-weekend-knit"
        : "top-trail-overshirt",
    );
  const fit =
    appearance.shoes === "lake-boots"
      ? "tucked"
      : appearance.shoes === "trail-hikers"
        ? "ankle"
        : "full";
  if (appearance.bottom === "classic") {
    if (appearance.bottomColor !== "original")
      ids.push(("bottom-classic-dyed-" + fit) as WardrobeAssetId);
    else if (fit !== "tucked")
      ids.push(fit === "full" ? "bottom-classic-full" : "bottom-classic-ankle");
  } else if (appearance.bottom === "trail-cargo") {
    ids.push(("bottom-trail-cargo-" + fit) as WardrobeAssetId);
  } else {
    ids.push(
      fit === "full"
        ? "bottom-weekend-shorts"
        : (("bottom-weekend-shorts-" + fit) as WardrobeAssetId),
    );
  }
  if (appearance.shoes !== "lake-boots")
    ids.push(
      appearance.shoes === "trail-hikers"
        ? "shoes-trail-hikers"
        : "shoes-canvas-low",
    );
  return ids;
}
