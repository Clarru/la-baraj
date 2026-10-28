import { describe, it, expect } from "vitest";
import { readLocalHome, mapHomePosition, playerMapRotation } from "./home";
describe("local home and navigation", () => {
  it("restores a valid home and recovers safely from corrupt or blocked storage", () => {
    const data = new Map<string, string>();
    const store = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
    expect(readLocalHome(store)).toBe(18);
    expect(readLocalHome(store)).toBe(18);
    store.setItem("lake-cincis-home-v1", JSON.stringify({ plotIndex: 4 }));
    expect(readLocalHome(store)).toBe(4);
    store.setItem("lake-cincis-home-v1", JSON.stringify({ plotIndex: 99 }));
    expect(readLocalHome(store)).toBe(18);
    expect(
      readLocalHome({
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {},
      }),
    ).toBe(18);
  });
  it("keeps an offscreen home at the correct edge bearing and maps north/east/south correctly", () => {
    const point = mapHomePosition({ x: 300, z: 150 }, { x: 0, z: 0 }, 220);
    expect(point.offscreen).toBe(true);
    expect(point.x).toBeCloseTo(91.3);
    expect(point.z / point.x).toBeCloseTo(0.5);
    expect(playerMapRotation(Math.PI)).toBeCloseTo(0);
    expect(playerMapRotation(Math.PI / 2)).toBeCloseTo(90);
    expect(playerMapRotation(0)).toBeCloseTo(180);
  });
});
