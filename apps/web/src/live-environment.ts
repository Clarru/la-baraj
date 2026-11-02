import {
  environmentDefaults,
  type EnvironmentTuning,
} from "./environment-tuning";
import authoredDefaults from "./environment-profile-defaults.json";
export type RenderSettings = Pick<
  EnvironmentTuning,
  "light" | "atmosphere" | "water"
>;
const baseRender: RenderSettings = {
  light: environmentDefaults.light,
  atmosphere: environmentDefaults.atmosphere,
  water: environmentDefaults.water,
};
const recipe = authoredDefaults["goldenHour:mist"];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
/** Only approved rendering values go live. Preview clock, browser flags and actions do not. */
export function liveEnvironment(
  paletteHour: number,
  fogPresence: number,
): RenderSettings {
  const weight =
    smooth((paletteHour - 17) / 0.25) *
    smooth((19 - paletteHour) / 0.25) *
    fogPresence;
  if (weight <= 0) return baseRender;
  const base = environmentDefaults;
  return {
    light: {
      ...base.light,
      sun: mix(base.light.sun, recipe["light.sun"], weight),
      hemisphere: mix(
        base.light.hemisphere,
        recipe["light.hemisphere"],
        weight,
      ),
      ambient: mix(base.light.ambient, recipe["light.ambient"], weight),
      exposure: mix(base.light.exposure, recipe["light.exposure"], weight),
    },
    atmosphere: {
      ...base.atmosphere,
      fogNear: mix(
        base.atmosphere.fogNear,
        recipe["atmosphere.fogNear"],
        weight,
      ),
      fogFar: mix(base.atmosphere.fogFar, recipe["atmosphere.fogFar"], weight),
      cloudScale: mix(
        base.atmosphere.cloudScale,
        recipe["atmosphere.cloudScale"],
        weight,
      ),
      cloudOpacity: mix(
        base.atmosphere.cloudOpacity,
        recipe["atmosphere.cloudOpacity"],
        weight,
      ),
      wind: {
        x: mix(base.atmosphere.wind.x, recipe["atmosphere.wind"].x, weight),
        y: mix(base.atmosphere.wind.y, recipe["atmosphere.wind"].y, weight),
      },
    },
    water: {
      waveSpeed: mix(base.water.waveSpeed, recipe["water.waveSpeed"], weight),
      distortion: mix(
        base.water.distortion,
        recipe["water.distortion"],
        weight,
      ),
      size: mix(base.water.size, recipe["water.size"], weight),
    },
  };
}
