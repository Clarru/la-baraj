import { it, expect } from "vitest";
import {
  ARCADE_STATIONS,
  LEGACY_ARCADE_STATION,
  closestArcadeStation,
  arcadeControlledStation,
  arcadeStandingPoint,
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

it("only grants local controls to the current public occupant and preserves the legacy fallback", () => {
  const stations = [
    {
      id: 2,
      playerId: "friend",
      name: "Friend",
      game: null,
      best: 0,
      direction: null,
    },
  ];
  expect(arcadeControlledStation(2, "old-owner", stations, true)).toBeNull();
  expect(arcadeControlledStation(2, "friend", stations, true)).toBe(2);
  expect(
    arcadeControlledStation(
      2,
      "friend",
      [{ ...stations[0], playerId: null }],
      true,
    ),
  ).toBeNull();
  expect(arcadeControlledStation(null, "friend", stations, true)).toBeNull();
  expect(arcadeControlledStation(-1, "friend", [], false)).toBe(-1);
});

it("places the player at the explicitly claimed cabinet, facing its screen, only for numbered ownership", () => {
  for (const station of ARCADE_STATIONS) {
    const point = arcadeStandingPoint(
      arcadeControlledStation(
        station.id,
        "you",
        [
          {
            id: station.id,
            playerId: "you",
            name: "You",
            game: null,
            best: 0,
            direction: null,
          },
        ],
        true,
      ),
    )!;
    expect(Math.hypot(point.x - station.x, point.z - station.z)).toBeCloseTo(
      1.2,
    );
    expect(closestArcadeStation(point.x, point.z).id).toBe(station.id);
    expect(
      Math.sin(point.yaw) * (station.x - point.x) +
        Math.cos(point.yaw) * (station.z - point.z),
    ).toBeCloseTo(1.2);
  }
  expect(
    arcadeStandingPoint(arcadeControlledStation(2, "you", [], true)),
  ).toBeNull();
  expect(arcadeStandingPoint(null)).toBeNull();
  expect(arcadeStandingPoint(-1)).toBeNull();
});
