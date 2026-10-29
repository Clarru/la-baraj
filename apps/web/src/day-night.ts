import * as THREE from "three";

let serverClock: { time: number; local: number } | null = null;
/** An initial server snapshot corrects device clock differences without polling. */
export function syncWorldTime(serverTime: number) {
  if (Number.isFinite(serverTime))
    serverClock = { time: serverTime, local: performance.now() };
}
export function worldNow() {
  return serverClock
    ? serverClock.time + performance.now() - serverClock.local
    : Date.now();
}
/** All clients derive the same game time from the Unix epoch; a game day is one hour. */
export const GAME_DAY_MS = 60 * 60 * 1000;
export function gameMinutes(now: number) {
  return Math.floor(
    ((((now % GAME_DAY_MS) + GAME_DAY_MS) % GAME_DAY_MS) * 1440) / GAME_DAY_MS,
  );
}
export function formatGameTime(now: number) {
  const minutes = gameMinutes(now);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

type Palette = {
  hour: number;
  sky: string;
  horizon: string;
  fog: string;
  land: string;
  sun: string;
  hemi: string;
  water: string;
  sunIntensity: number;
  hemiIntensity: number;
};
// A handful of authored lighting moods blend continuously; nighttime stays navigable.
const moods: Palette[] = [
  {
    hour: 0,
    sky: "#1c2d43",
    horizon: "#536876",
    fog: "#53635f",
    land: "#71838b",
    sun: "#b6cceb",
    hemi: "#a4b8ce",
    water: "#254953",
    sunIntensity: 0.75,
    hemiIntensity: 0.45,
  },
  {
    hour: 5,
    sky: "#445e78",
    horizon: "#b29b89",
    fog: "#8c9a91",
    land: "#b4b7ac",
    sun: "#ffc393",
    hemi: "#cfced0",
    water: "#345c61",
    sunIntensity: 1.25,
    hemiIntensity: 0.58,
  },
  {
    hour: 7,
    sky: "#83b0c2",
    horizon: "#e0c5a9",
    fog: "#b5c4b2",
    land: "#f7ead7",
    sun: "#ffd6a7",
    hemi: "#e7e8d9",
    water: "#2d676b",
    sunIntensity: 2.6,
    hemiIntensity: 0.72,
  },
  {
    hour: 12,
    sky: "#82b0c7",
    horizon: "#bed0be",
    fog: "#aec5b5",
    land: "#ffffff",
    sun: "#ffe2b3",
    hemi: "#eef1db",
    water: "#145b61",
    sunIntensity: 3.3,
    hemiIntensity: 0.75,
  },
  {
    hour: 17,
    sky: "#7a9eb1",
    horizon: "#dbc0a1",
    fog: "#b7bca9",
    land: "#ead8c4",
    sun: "#ffd09a",
    hemi: "#eee4d3",
    water: "#255c60",
    sunIntensity: 2.7,
    hemiIntensity: 0.68,
  },
  {
    hour: 19,
    sky: "#536f85",
    horizon: "#d7a080",
    fog: "#a6a89b",
    land: "#cbb6a4",
    sun: "#ffb57b",
    hemi: "#d8c7b8",
    water: "#254f58",
    sunIntensity: 1.8,
    hemiIntensity: 0.6,
  },
  {
    hour: 21,
    sky: "#273b53",
    horizon: "#637380",
    fog: "#65716e",
    land: "#88989a",
    sun: "#c1c9df",
    hemi: "#afb9c9",
    water: "#254c55",
    sunIntensity: 0.9,
    hemiIntensity: 0.49,
  },
  {
    hour: 24,
    sky: "#1c2d43",
    horizon: "#536876",
    fog: "#53635f",
    land: "#71838b",
    sun: "#b6cceb",
    hemi: "#a4b8ce",
    water: "#254953",
    sunIntensity: 0.75,
    hemiIntensity: 0.45,
  },
];
type ColorName = "sky" | "horizon" | "fog" | "land" | "sun" | "hemi" | "water";
const colorNames: ColorName[] = [
  "sky",
  "horizon",
  "fog",
  "land",
  "sun",
  "hemi",
  "water",
];
const prepared = moods.map((m) => ({
  ...m,
  colors: Object.fromEntries(
    colorNames.map((k) => [k, new THREE.Color(m[k])]),
  ) as Record<ColorName, THREE.Color>,
}));
export type Lighting = {
  colors: Record<ColorName, THREE.Color>;
  sunDirection: THREE.Vector3;
  sunIntensity: number;
  hemiIntensity: number;
};
export function lightingAt(hour: number): Lighting {
  hour = ((hour % 24) + 24) % 24;
  const index = prepared.findIndex(
    (m, i) =>
      i < prepared.length - 1 && hour >= m.hour && hour < prepared[i + 1].hour,
  );
  const a = prepared[index],
    b = prepared[index + 1];
  const t = (hour - a.hour) / (b.hour - a.hour),
    smooth = t * t * (3 - 2 * t);
  const colors = Object.fromEntries(
    colorNames.map((k) => [k, a.colors[k].clone().lerp(b.colors[k], smooth)]),
  ) as Record<ColorName, THREE.Color>;
  const angle = ((hour - 6) * Math.PI) / 12;
  return {
    colors,
    sunDirection: new THREE.Vector3(
      Math.cos(angle) * 0.8 - 0.1,
      0.16 + Math.max(0, Math.sin(angle)) * 0.8,
      -0.75,
    ).normalize(),
    sunIntensity: THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, smooth),
    hemiIntensity: THREE.MathUtils.lerp(
      a.hemiIntensity,
      b.hemiIntensity,
      smooth,
    ),
  };
}
let cacheKey = "",
  cached: Lighting;
/** Cache a shared lighting sample once per second across sky, lights and water. */
export function currentLighting(evening = false, forceDay = false) {
  const override =
    import.meta.env.VITE_GAME_DIAGNOSTICS === "1"
      ? new URLSearchParams(location.search).get("time")
      : null;
  const hour = evening
    ? 19
    : override !== null && Number.isFinite(Number(override))
      ? Number(override)
      : forceDay
        ? 12
        : (((Math.floor(worldNow() / 1000) * 1000) % GAME_DAY_MS) /
            GAME_DAY_MS) *
          24;
  const key = hour.toFixed(3);
  if (cacheKey !== key) {
    cacheKey = key;
    cached = lightingAt(hour);
  }
  return cached;
}
