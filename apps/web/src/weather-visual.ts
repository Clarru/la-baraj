import { type LakeWeather } from "../../../packages/shared/weather";

/** Cloudiness changes gradually, avoiding a sudden sky change on an update. */
const TRANSITION_MS = 25_000;
let start = 0,
  target = 0,
  startedAt = 0,
  startFog = 0,
  targetFog = 0;
function sample(now: number) {
  const t = Math.min(1, Math.max(0, (now - startedAt) / TRANSITION_MS));
  const smooth = t * t * (3 - 2 * t);
  return start + (target - start) * smooth;
}
export function cloudinessForWeather(weather: LakeWeather | null) {
  if (!weather) return 0;
  const code = weather.weatherCode;
  const wetOrFoggy = code >= 45 && code <= 99;
  return Math.max(
    weather.cloudCover / 100,
    wetOrFoggy ? 0.75 : code === 3 ? 0.7 : 0,
  );
}
export function setWorldWeather(
  weather: LakeWeather | null,
  now = performance.now(),
) {
  const next = cloudinessForWeather(weather);
  const nextFog =
    weather?.weatherCode === 45 || weather?.weatherCode === 48 ? 1 : 0;
  if (next === target && nextFog === targetFog) return;
  startFog = fogPresence(now);
  targetFog = nextFog;
  start = sample(now);
  target = next;
  startedAt = now;
}
export function cloudiness(now = performance.now()) {
  if (import.meta.env.VITE_GAME_DIAGNOSTICS === "1") {
    const view = new URLSearchParams(location.search).get("weather");
    if (view === "clear") return 0;
    if (view === "partly") return 0.5;
    if (view === "cloudy") return 1;
  }
  return sample(now);
}

/** Real WMO fog/mist classification, blended on the same clock as cloud cover. */
export function fogPresence(now = performance.now()) {
  const t = Math.min(1, Math.max(0, (now - startedAt) / TRANSITION_MS));
  const smooth = t * t * (3 - 2 * t);
  return startFog + (targetFog - startFog) * smooth;
}
