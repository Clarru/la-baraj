import { it, expect } from "vitest";
import {
  ARCADE_STATIONS,
  LEGACY_ARCADE_STATION,
  closestArcadeStation,
} from "../../../packages/shared/arcade2048-station";
it("selects the cabinet directly ahead on every diagonal approach, even when a neighbour's side is nearer", () => {
  for (const station of ARCADE_STATIONS) {
    const x = station.x + 1.5 / Math.sqrt(2),
      z = station.z + 1.5 / Math.sqrt(2);
    expect(closestArcadeStation(x, z).id).toBe(station.id);
  }
  expect(closestArcadeStation(12, 72, [LEGACY_ARCADE_STATION]).id).toBe(-1);
});
it("always keeps a physically reachable station eligible before ranking the approach points", () => {
  for (let x = -14; x <= -4; x += 0.25)
    for (let z = 70; z <= 78; z += 0.25) {
      if (!ARCADE_STATIONS.some((s) => Math.hypot(x - s.x, z - s.z) < 2.3))
        continue;
      const station = closestArcadeStation(x, z);
      expect(Math.hypot(x - station.x, z - station.z)).toBeLessThan(2.3);
    }
});
