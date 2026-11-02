import { expect, it } from "vitest";
import {
  readProfileSelection,
  profileId,
  rememberProfile,
  exportProfiles,
  phaseHour,
} from "./environment-profiles";
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  } satisfies Storage;
}
it("recovers the old dawn/partly-cloudy working draft without touching its original or other conditions", () => {
  const s = storage(),
    now = Date.parse("2026-11-02T12:00:00Z");
  const raw = JSON.stringify({
    version: 1,
    values: {
      "clock.hour": 5.5,
      "weather.look": "clear",
      "weather.liveWeather": false,
      "weather.cloudCover": 0.5,
      "light.sun": 0.43,
      "light.sunPosition": { x: 12, y: 9 },
    },
    presets: [],
  });
  s.setItem("dialkit:la-baraj-environment-v1", raw);
  const selection = readProfileSelection(s, now);
  expect(selection).toEqual({ time: "dawn", weather: "partly", month: 0 });
  const recovered = JSON.parse(s.getItem(`dialkit:${profileId(selection)}`)!);
  expect(recovered.values["light.sun"]).toBe(0.43);
  expect(recovered.values["light.sunPosition"].y).toBe(9);
  expect(recovered.values["clock.hour"]).toBe(phaseHour("dawn", now));
  expect(s.getItem("dialkit:la-baraj-environment-v1")).toBe(raw);
  expect(
    s.getItem(`dialkit:${profileId({ time: "dawn", weather: "clear" })}`),
  ).toBeNull();
  recovered.values["light.sun"] = 0.22;
  s.setItem(`dialkit:${profileId(selection)}`, JSON.stringify(recovered));
  readProfileSelection(s, now);
  expect(
    JSON.parse(s.getItem(`dialkit:${profileId(selection)}`)!).values[
      "light.sun"
    ],
  ).toBe(0.22);
  expect(Object.keys(exportProfiles(s))).toEqual(["dawn:partly"]);
});
it("restores the active condition/month and handles unavailable/corrupt storage", () => {
  const s = storage();
  rememberProfile(s, { time: "dusk", weather: "storm", month: 12 });
  expect(readProfileSelection(s, Date.now())).toEqual({
    time: "dusk",
    weather: "storm",
    month: 12,
  });
  s.clear();
  s.setItem("la-baraj-environment-selection-v2", "broken");
  expect(readProfileSelection(s, Date.now()).time).toBe("noon");
  const blocked = {
    ...s,
    getItem: () => {
      throw Error("denied");
    },
  };
  expect(readProfileSelection(blocked, Date.now()).time).toBe("noon");
});
