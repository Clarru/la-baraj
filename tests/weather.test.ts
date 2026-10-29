import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LakeWeatherService,
  FORECAST_URL,
  parseForecast,
} from "../apps/server/lake-weather";
import {
  WEATHER_MAX_AGE_MS,
  WEATHER_REFRESH_MS,
  WEATHER_RETRY_MS,
  weatherDescription,
} from "../packages/shared/weather";

const now = Date.parse("2026-10-29T11:02:00Z");
const forecast = {
  current: {
    time: "2026-10-29T11:00",
    interval: 900,
    cloud_cover: 80,
    weather_code: 3,
  },
};
function storage() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async <T>(key: string) =>
      structuredClone(data.get(key)) as T | undefined,
    put: async (key: string, value: unknown) => {
      data.set(key, structuredClone(value));
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Lake Cinciș weather", () => {
  it("accepts only valid recent provider values and maps all useful WMO states", () => {
    expect(parseForecast(forecast, now)).toEqual({
      cloudCover: 80,
      weatherCode: 3,
      observedAt: now - 120000,
      fetchedAt: now,
    });
    expect(
      parseForecast(
        { current: { ...forecast.current, cloud_cover: 101 } },
        now,
      ),
    ).toBeNull();
    expect(
      parseForecast({ current: { ...forecast.current, time: "invalid" } }, now),
    ).toBeNull();
    expect(parseForecast(forecast, now + 2 * 60 * 60 * 1000)).toBeNull();
    const w = parseForecast(forecast, now)!;
    expect(weatherDescription(w)).toBe("Cloudy");
    expect(weatherDescription({ ...w, cloudCover: 0, weatherCode: 0 })).toBe(
      "Clear",
    );
    expect(weatherDescription({ ...w, weatherCode: 61 })).toBe("Rain");
    expect(weatherDescription({ ...w, weatherCode: 75 })).toBe("Snow");
    expect(weatherDescription({ ...w, weatherCode: 45 })).toBe("Fog");
    expect(weatherDescription({ ...w, weatherCode: 95 })).toBe("Thunderstorms");
  });
  it("coalesces concurrent requests and uses a persisted 15-minute shared cache", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const store = storage(),
      announce = vi.fn();
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify(forecast), { status: 200 }),
    );
    const service = new LakeWeatherService(
      store,
      announce,
      fetcher as typeof fetch,
    );
    await service.load(now);
    await Promise.all(Array.from({ length: 50 }, () => service.refresh(now)));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(FORECAST_URL);
    expect(service.current(now)?.cloudCover).toBe(80);
    await service.refresh(now + WEATHER_REFRESH_MS - 1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const restored = new LakeWeatherService(
      store,
      vi.fn(),
      fetcher as typeof fetch,
    );
    await restored.load(now + 1000);
    expect(restored.current(now + 1000)).toEqual(service.current(now));
    await restored.refresh(now + WEATHER_REFRESH_MS - 1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps recent data on failures, throttles retries and expires old results", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const store = storage(),
      announce = vi.fn();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(forecast), { status: 200 }),
      )
      .mockRejectedValue(new Error("offline"));
    const service = new LakeWeatherService(
      store,
      announce,
      fetcher as typeof fetch,
    );
    await service.load(now);
    await service.refresh(now);
    vi.setSystemTime(now + WEATHER_REFRESH_MS);
    await service.refresh(Date.now());
    expect(service.current(Date.now())?.weatherCode).toBe(3);
    await service.refresh(Date.now() + WEATHER_RETRY_MS - 1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.setSystemTime(now + WEATHER_MAX_AGE_MS + WEATHER_RETRY_MS);
    await service.refresh(Date.now());
    expect(service.current()).toBeNull();
    expect(announce).toHaveBeenLastCalledWith(null);
  });
});

it("calls the runtime fetch without rebinding its required global receiver", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const fetcher = vi.fn(function (this: unknown) {
    if (this !== undefined && this !== globalThis)
      throw new TypeError("Illegal invocation");
    return Promise.resolve(
      new Response(JSON.stringify(forecast), { status: 200 }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  try {
    const service = new LakeWeatherService(storage(), vi.fn());
    await service.load(now);
    await service.refresh(now);
    expect(service.current(now)?.weatherCode).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
