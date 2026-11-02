// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("dialkit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("dialkit")>()),
  DialRoot: () => null,
  DialTimeline: () => null,
}));
import { DialStore } from "dialkit";
import EnvironmentLab from "./EnvironmentLab";
import { profileId } from "./environment-profiles";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it("isolates real Dialkit controllers by time/weather, restores edits, and resets only the active condition", async () => {
  localStorage.clear();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const id = (time: "dawn" | "morning", weather: "clear" | "partly") =>
    profileId({ time, weather });
  const choose = async (label: string, value: string) => {
    const el = host.querySelector<HTMLSelectElement>(
      `select[aria-label="${label}"]`,
    )!;
    el.focus();
    await act(async () => {
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(document.activeElement).toBe(el);
  };
  try {
    await act(async () => root.render(<EnvironmentLab onEditing={() => {}} />));
    await choose("Time profile", "dawn");
    await choose("Weather profile", "partly");
    await act(async () => {
      DialStore.updateValues(id("dawn", "partly"), {
        "light.sun": 0.43,
        "light.exposure": 0.51,
        "light.manualSun": true,
        "light.sunPosition": { x: 12, y: 9 },
      });
    });
    await choose("Weather profile", "clear");
    expect(DialStore.getValues(id("dawn", "clear"))["light.sun"]).toBe(1);
    expect(DialStore.getValues(id("dawn", "clear"))["light.exposure"]).toBe(
      0.92,
    );
    expect(DialStore.getValues(id("dawn", "clear"))["light.manualSun"]).toBe(
      false,
    );
    await choose("Weather profile", "partly");
    expect(DialStore.getValues(id("dawn", "partly"))["light.sun"]).toBe(0.43);
    expect(
      DialStore.getValues(id("dawn", "partly"))["light.sunPosition"],
    ).toEqual({ x: 12, y: 9 });
    await choose("Time profile", "morning");
    expect(DialStore.getValues(id("morning", "partly"))["light.exposure"]).toBe(
      0.92,
    );
    await choose("Time profile", "dawn");
    expect(DialStore.getValues(id("dawn", "partly"))["light.exposure"]).toBe(
      0.51,
    );
    await choose("Preview month", "1");
    const january = DialStore.getValues(id("dawn", "partly"))[
      "clock.hour"
    ] as number;
    await choose("Weather profile", "clear");
    await choose("Preview month", "6");
    const june = DialStore.getValues(id("dawn", "clear"))[
      "clock.hour"
    ] as number;
    expect(june).toBeLessThan(january - 1);
    await choose("Weather profile", "partly");
    expect(DialStore.getValues(id("dawn", "partly"))["clock.hour"]).toBeCloseTo(
      june,
    );
    await act(async () =>
      DialStore.updateValue(id("dawn", "partly"), "clock.hour", 17.5),
    );
    await choose("Preview month", "12");
    await choose("Weather profile", "clear");
    await choose("Weather profile", "partly");
    expect(DialStore.getValues(id("dawn", "partly"))["clock.hour"]).toBe(17.5);
    const stored = JSON.parse(
      localStorage.getItem(`dialkit:${id("dawn", "partly")}`)!,
    );
    expect(stored.values["light.sun"]).toBe(0.43);
    await act(async () =>
      DialStore.triggerAction(id("dawn", "partly"), "reset"),
    );
    expect(DialStore.getValues(id("dawn", "partly"))["light.sun"]).toBe(1);
    expect(DialStore.getValues(id("dawn", "clear"))["light.exposure"]).toBe(
      0.92,
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
  }
});

it("uses the authored Golden hour / Lakeside mist recipe as defaults and reset values without discarding later edits", async () => {
  localStorage.clear();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const target = profileId({ time: "goldenHour", weather: "mist" });
  const choose = async (label: string, value: string) => {
    const el = host.querySelector<HTMLSelectElement>(
      `select[aria-label="${label}"]`,
    )!;
    await act(async () => {
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<EnvironmentLab onEditing={() => {}} />));
    await choose("Time profile", "goldenHour");
    await choose("Weather profile", "mist");
    let values = DialStore.getValues(target);
    expect(values["clock.hour"]).toBe(16.5);
    expect(values["light.sun"]).toBe(0.3);
    expect(values["light.hemisphere"]).toBe(0.6);
    expect(values["light.ambient"]).toBe(0.9);
    expect(values["light.exposure"]).toBe(0.71);
    expect(values["light.manualSun"]).toBe(false);
    expect(values["palette.customColors"]).toBe(false);
    expect(values["weather.cloudCover"]).toBe(0.8);
    expect(values["water.distortion"]).toBe(0.3);
    await act(async () =>
      DialStore.updateValues(target, {
        "light.sun": 0.41,
        "light.exposure": 0.62,
      }),
    );
    await choose("Weather profile", "clear");
    expect(
      DialStore.getValues(profileId({ time: "goldenHour", weather: "clear" }))[
        "light.sun"
      ],
    ).toBe(1);
    await choose("Weather profile", "mist");
    expect(DialStore.getValues(target)["light.sun"]).toBe(0.41);
    await choose("Preview month", "1");
    expect(DialStore.getValues(target)["clock.hour"]).toBe(16.5);
    await act(async () => DialStore.triggerAction(target, "reset"));
    values = DialStore.getValues(target);
    expect(values["clock.hour"]).toBe(16.5);
    expect(values["light.sun"]).toBe(0.3);
    expect(values["light.exposure"]).toBe(0.71);
    expect(
      DialStore.getValues(profileId({ time: "goldenHour", weather: "clear" }))[
        "light.sun"
      ],
    ).toBe(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
  }
});
