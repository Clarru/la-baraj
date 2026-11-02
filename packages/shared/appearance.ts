/** Bounded cosmetic IDs only. Asset paths and material values never cross the wire. */
export const HAIR_IDS = ["parted", "buzzed", "long"] as const;
export const HAT_IDS = ["none", "panel-cap", "knit-beanie", "stitched-bucket"] as const;
export const TOP_IDS = ["lake-workshirt", "trail-overshirt", "weekend-knit"] as const;
export const BOTTOM_IDS = ["classic", "trail-cargo", "weekend-shorts"] as const;
export const SHOE_IDS = ["lake-boots", "trail-hikers", "canvas-low"] as const;
export const BEARD_IDS = ["none", "full", "short", "moustache"] as const;
export const HAIR_COLORS = ["brown", "black", "blond", "auburn", "grey"] as const;
export const CLOTH_COLORS = ["original", "navy", "sage", "charcoal", "cream", "rust"] as const;

export type MaleAppearance = {
  version: 1;
  body: "male";
  hair: (typeof HAIR_IDS)[number];
  hat: (typeof HAT_IDS)[number];
  top: (typeof TOP_IDS)[number];
  bottom: (typeof BOTTOM_IDS)[number];
  shoes: (typeof SHOE_IDS)[number];
  beard: (typeof BEARD_IDS)[number];
  hairColor: (typeof HAIR_COLORS)[number];
  topColor: (typeof CLOTH_COLORS)[number];
  bottomColor: (typeof CLOTH_COLORS)[number];
};
/** One complete female preset, deliberately without a second wardrobe catalogue. */
export type FemaleAppearance = { version: 1; body: "female" };
export type Appearance = MaleAppearance | FemaleAppearance;
export const DEFAULT_APPEARANCE: Readonly<MaleAppearance> = Object.freeze({
  version: 1,
  body: "male",
  hair: "parted",
  hat: "none",
  top: "lake-workshirt",
  bottom: "classic",
  shoes: "lake-boots",
  beard: "full",
  hairColor: "brown",
  topColor: "original",
  bottomColor: "original",
});

function choice<T extends string>(ids: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && ids.includes(value as T) ? value as T : fallback;
}

/** Old, missing or unknown fields resolve independently to the approved default. */
export function normalizeAppearance(value: unknown): Appearance {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ...DEFAULT_APPEARANCE };
  const source = value as Record<string, unknown>;
  if (source.version !== 1) return { ...DEFAULT_APPEARANCE };
  if (source.body === "female") return { version: 1, body: "female" };
  if (source.body !== "male") return { ...DEFAULT_APPEARANCE };
  return {
    version: 1,
    body: "male",
    hair: choice(HAIR_IDS, source.hair, DEFAULT_APPEARANCE.hair),
    hat: choice(HAT_IDS, source.hat, DEFAULT_APPEARANCE.hat),
    top: choice(TOP_IDS, source.top, DEFAULT_APPEARANCE.top),
    bottom: choice(BOTTOM_IDS, source.bottom, DEFAULT_APPEARANCE.bottom),
    shoes: choice(SHOE_IDS, source.shoes, DEFAULT_APPEARANCE.shoes),
    beard: choice(BEARD_IDS, source.beard, DEFAULT_APPEARANCE.beard),
    hairColor: choice(HAIR_COLORS, source.hairColor, DEFAULT_APPEARANCE.hairColor),
    topColor: choice(CLOTH_COLORS, source.topColor, DEFAULT_APPEARANCE.topColor),
    bottomColor: choice(CLOTH_COLORS, source.bottomColor, DEFAULT_APPEARANCE.bottomColor),
  };
}

export function appearanceKey(value: Appearance): string {
  return JSON.stringify(normalizeAppearance(value));
}
