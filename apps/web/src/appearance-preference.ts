import {
  normalizeAppearance,
  type Appearance,
} from "../../../packages/shared/appearance";
import { CANONICAL_WORLD_ID } from "../../../packages/shared/protocol";
const key = "la-baraj:appearance:v1:" + CANONICAL_WORLD_ID;

/** Missing or corrupt local preferences do not overwrite a restored server profile. */
export function readAppearancePreference(): Appearance | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("body" in value) ||
      !["male", "female"].includes(String(value.body))
    )
      return null;
    return normalizeAppearance(value);
  } catch {
    return null;
  }
}

export function saveAppearancePreference(value: Appearance): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(normalizeAppearance(value)));
    return true;
  } catch {
    return false;
  }
}
