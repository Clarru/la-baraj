import { solarDay } from "./solar";
export const timeProfiles = {
  dawn: "Dawn",
  morning: "Morning",
  noon: "Noon",
  goldenHour: "Golden hour",
  dusk: "Dusk",
  midnight: "Midnight",
} as const;
export const weatherProfiles = {
  clear: "Clear",
  partly: "Partly cloudy",
  overcast: "Overcast",
  mist: "Lakeside mist",
  rain: "Rain light",
  storm: "Storm light",
  snow: "Snow light",
} as const;
export type TimeProfile = keyof typeof timeProfiles;
export type WeatherProfile = keyof typeof weatherProfiles;
export type ProfileSelection = {
  time: TimeProfile;
  weather: WeatherProfile;
  month: number;
};
export const selectionKey = "la-baraj-environment-selection-v2";
export const profileId = (s: Pick<ProfileSelection, "time" | "weather">) =>
  `la-baraj-environment-v2:${s.time}:${s.weather}`;
export function phaseHour(time: TimeProfile, now: number, month = 0) {
  const day = solarDay(now, month);
  return {
    dawn: day.dawn + 0.15,
    morning: day.sunrise + 1,
    noon: day.noon,
    goldenHour: day.sunset - 0.75,
    dusk: day.sunset + 0.15,
    midnight: 0,
  }[time];
}
const oldHours = {
  dawn: 5.5,
  morning: 8,
  noon: 12,
  goldenHour: 18,
  dusk: 20,
  midnight: 0,
};
function validSelection(s: unknown): s is ProfileSelection {
  if (!s || typeof s !== "object") return false;
  const v = s as ProfileSelection;
  return (
    Object.hasOwn(timeProfiles, v.time) &&
    Object.hasOwn(weatherProfiles, v.weather) &&
    Number.isInteger(v.month) &&
    v.month >= 0 &&
    v.month <= 12
  );
}
/** Copies the old draft once; original values/versions remain an untouched backup. */
export function readProfileSelection(
  storage: Storage,
  now: number,
): ProfileSelection {
  const fallback: ProfileSelection = {
    time: "noon",
    weather: "clear",
    month: 0,
  };
  try {
    const saved = JSON.parse(storage.getItem(selectionKey) ?? "null");
    if (validSelection(saved)) return saved;
    const legacy = JSON.parse(
      storage.getItem("dialkit:la-baraj-environment-v1") ?? "null",
    );
    if (
      legacy?.version === 1 &&
      legacy.values &&
      typeof legacy.values === "object"
    ) {
      const values = legacy.values;
      const hour =
        typeof values["clock.hour"] === "number" ? values["clock.hour"] : 12;
      const time = (Object.keys(oldHours) as TimeProfile[]).reduce((a, b) =>
        Math.abs(oldHours[a] - hour) <= Math.abs(oldHours[b] - hour) ? a : b,
      );
      let weather: WeatherProfile = Object.hasOwn(
        weatherProfiles,
        values["weather.look"],
      )
        ? values["weather.look"]
        : "clear";
      // Old selection did not apply a look until a separate button was clicked.
      if (
        values["weather.liveWeather"] === false &&
        values["weather.cloudCover"] === 0.5
      )
        weather = "partly";
      const selection = { time, weather, month: 0 };
      const key = `dialkit:${profileId(selection)}`;
      if (!storage.getItem(key)) {
        const migrated = structuredClone(legacy);
        if (Math.abs(hour - oldHours[time]) < 0.02) {
          migrated.values["clock.hour"] = phaseHour(time, now);
          if (migrated.baseValues)
            migrated.baseValues["clock.hour"] = phaseHour(time, now);
        }
        storage.setItem(key, JSON.stringify(migrated));
        const thumbnails = storage.getItem(
          "dialkit:la-baraj-environment-v1:thumbnails",
        );
        if (thumbnails) storage.setItem(`${key}:thumbnails`, thumbnails);
      }
      storage.setItem(selectionKey, JSON.stringify(selection));
      return selection;
    }
  } catch {
    /* Storage denial/corruption never blocks the editor or destroys its old draft. */
  }
  return fallback;
}
export function rememberProfile(storage: Storage, selection: ProfileSelection) {
  try {
    storage.setItem(selectionKey, JSON.stringify(selection));
  } catch {
    /* Session-only editing remains available. */
  }
}
export function exportProfiles(storage: Storage) {
  const profiles: Record<string, unknown> = {};
  for (const time of Object.keys(timeProfiles) as TimeProfile[])
    for (const weather of Object.keys(weatherProfiles) as WeatherProfile[]) {
      const key = `dialkit:${profileId({ time, weather })}`;
      try {
        const raw = storage.getItem(key);
        if (raw) profiles[`${time}:${weather}`] = JSON.parse(raw);
      } catch {
        /* Preserve other valid profiles. */
      }
    }
  return profiles;
}

const clockBases = new Map<string, number>();
/** Remember the automatic phase basis separately from a deliberately edited hour. */
export function syncProfileHour(
  storage: Storage | null,
  selection: ProfileSelection,
  hour: number,
  now: number,
  authoredHour?: number,
) {
  const id = profileId(selection),
    key = `la-baraj-environment-clock-v2:${selection.time}:${selection.weather}`;
  let prior = clockBases.get(id);
  try {
    const stored = JSON.parse(storage?.getItem(key) ?? "null");
    if (
      typeof stored?.phaseHour === "number" &&
      Number.isFinite(stored.phaseHour)
    )
      prior = stored.phaseHour;
  } catch {
    /* Memory basis still supports this session. */
  }
  const phase = phaseHour(selection.time, now, selection.month);
  const fixedRecipeHour = authoredHour !== undefined && hour === authoredHour;
  const next =
    !fixedRecipeHour && Math.abs(hour - (prior ?? phase)) < 0.02 ? phase : hour;
  clockBases.set(id, phase);
  try {
    storage?.setItem(key, JSON.stringify({ phaseHour: phase }));
  } catch {
    /* Session-only basis. */
  }
  return next;
}
