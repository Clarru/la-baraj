import type { DialConfig } from "dialkit";
import authoredDefaults from "./environment-profile-defaults.json";
import type { ProfileSelection } from "./environment-profiles";

function recipe(
  selection: Pick<ProfileSelection, "time" | "weather">,
): (typeof authoredDefaults)["goldenHour:mist"] | undefined {
  const key = `${selection.time}:${selection.weather}`;
  return authoredDefaults[key as keyof typeof authoredDefaults];
}
export function authoredProfileHour(
  selection: Pick<ProfileSelection, "time" | "weather">,
) {
  return recipe(selection)?.["clock.hour"];
}
/** Apply copied Dialkit values to a cloned config, retaining ranges and control types. */
export function applyAuthoredProfileDefaults(
  config: DialConfig,
  selection: Pick<ProfileSelection, "time" | "weather">,
) {
  for (const [path, value] of Object.entries(recipe(selection) ?? {})) {
    const keys = path.split(".");
    let parent: Record<string, unknown> | undefined = config;
    for (const key of keys.slice(0, -1)) {
      const child: unknown = parent?.[key];
      parent =
        child && typeof child === "object" && !Array.isArray(child)
          ? (child as Record<string, unknown>)
          : undefined;
    }
    const key = keys.at(-1)!;
    if (!parent || !Object.hasOwn(parent, key)) continue;
    const control = parent[key];
    if (Array.isArray(control)) {
      if (typeof value === "number") control[0] = value;
      continue;
    }
    if (control && typeof control === "object") {
      const meta = control as Record<string, unknown>;
      if (meta.type === "action") continue;
      if (
        meta.type === "pad" &&
        value &&
        typeof value === "object" &&
        "x" in value &&
        "y" in value
      ) {
        if (Array.isArray(meta.x)) meta.x[0] = value.x;
        if (Array.isArray(meta.y)) meta.y[0] = value.y;
      } else {
        meta.default = value;
      }
    } else {
      parent[key] = value;
    }
  }
}
