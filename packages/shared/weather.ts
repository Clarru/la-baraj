/** Modelled current weather for the Lake Cinciș area, shared by the world. */
export type LakeWeather = {
  cloudCover: number;
  weatherCode: number;
  observedAt: number;
  fetchedAt: number;
};
export const WEATHER_REFRESH_MS = 15 * 60 * 1000;
export const WEATHER_RETRY_MS = 5 * 60 * 1000;
export const WEATHER_MAX_AGE_MS = 3 * 60 * 60 * 1000;

export function validLakeWeather(value: unknown): value is LakeWeather {
  if (typeof value !== "object" || value === null) return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.cloudCover === "number" &&
    Number.isFinite(w.cloudCover) &&
    w.cloudCover >= 0 &&
    w.cloudCover <= 100 &&
    typeof w.weatherCode === "number" &&
    Number.isInteger(w.weatherCode) &&
    w.weatherCode >= 0 &&
    w.weatherCode <= 99 &&
    typeof w.observedAt === "number" &&
    Number.isFinite(w.observedAt) &&
    typeof w.fetchedAt === "number" &&
    Number.isFinite(w.fetchedAt)
  );
}

/** WMO conditions remain visible even when precipitation is not simulated. */
export function weatherDescription(w: LakeWeather): string {
  const code = w.weatherCode;
  if (code >= 95) return "Thunderstorms";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return "Rain";
  if (code === 45 || code === 48) return "Fog";
  if (w.cloudCover >= 70 || code === 3) return "Cloudy";
  if (w.cloudCover >= 25 || code === 2) return "Partly cloudy";
  return "Clear";
}
