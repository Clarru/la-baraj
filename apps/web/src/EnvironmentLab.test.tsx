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
