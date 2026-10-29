import {
  WEATHER_MAX_AGE_MS,
  WEATHER_REFRESH_MS,
  WEATHER_RETRY_MS,
  validLakeWeather,
  type LakeWeather,
} from "../../packages/shared/weather";

// Coordinates are within the documented Lake Cinciș shoreline, not player location.
export const FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=45.69&longitude=22.85&current=cloud_cover%2Cweather_code&timezone=GMT&forecast_days=1";
const STORAGE_KEY = "lake-weather-v1";
type Cache = { nextAttemptAt: number; weather: LakeWeather | null };
type Store = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<unknown>;
};

export function parseForecast(value: unknown, now: number): LakeWeather | null {
  if (typeof value !== "object" || value === null) return null;
  const current = (value as { current?: unknown }).current;
  if (typeof current !== "object" || current === null) return null;
  const c = current as Record<string, unknown>;
  if (typeof c.time !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(c.time))
    return null;
  const observedAt = Date.parse(`${c.time}:00Z`);
  const weather = {
    cloudCover: c.cloud_cover,
    weatherCode: c.weather_code,
    observedAt,
    fetchedAt: now,
  };
  if (
    !validLakeWeather(weather) ||
    observedAt > now + 15 * 60 * 1000 ||
    observedAt < now - 90 * 60 * 1000
  )
    return null;
  return weather;
}

/** A single persisted cache for the one shared world; concurrent callers coalesce. */
export class LakeWeatherService {
  private cache: Cache = { nextAttemptAt: 0, weather: null };
  private pending: Promise<void> | null = null;
  constructor(
    private store: Store,
    private announce: (weather: LakeWeather | null) => void,
    private fetchForecast: typeof fetch = fetch,
  ) {}
  async load(now = Date.now()) {
    const saved = await this.store.get<Cache>(STORAGE_KEY);
    if (
      saved &&
      Number.isFinite(saved.nextAttemptAt) &&
      (saved.weather === null || validLakeWeather(saved.weather))
    )
      this.cache = saved;
    this.announce(this.current(now));
  }
  current(now = Date.now()) {
    const w = this.cache.weather;
    return w &&
      now - w.fetchedAt <= WEATHER_MAX_AGE_MS &&
      now - w.observedAt <= WEATHER_MAX_AGE_MS &&
      w.fetchedAt <= now + 60000
      ? w
      : null;
  }
  refresh(now = Date.now()): Promise<void> {
    if (this.pending) return this.pending;
    if (now < this.cache.nextAttemptAt) {
      this.announce(this.current(now));
      return Promise.resolve();
    }
    this.pending = this.fetchAndStore(now).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  private async fetchAndStore(now: number) {
    // Store the retry deadline before I/O so wake-ups and failures cannot cause a request storm.
    this.cache.nextAttemptAt = now + WEATHER_RETRY_MS;
    try {
      await this.store.put(STORAGE_KEY, this.cache);
      const response = await this.fetchForecast(FORECAST_URL, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("weather service unavailable");
      const forecast = parseForecast(await response.json(), now);
      if (!forecast) throw new Error("invalid weather response");
      const next = {
        weather: forecast,
        nextAttemptAt: now + WEATHER_REFRESH_MS,
      };
      await this.store.put(STORAGE_KEY, next);
      this.cache = next;
    } catch {
      // Keep the last good result until it ages out; retry later without breaking the room.
    }
    this.announce(this.current(Date.now()));
  }
}
