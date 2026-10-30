/** At the east edge of the gathering area, separate from both seated games. */
export const ARCADE_STATION = {
  x: 12,
  z: 70.37531356447997,
  height: 1.92,
  width: 0.76,
  depth: 0.72,
};
/** Three machines beside the gathering tables, facing the open approach from the road. */
export const ARCADE_STATIONS = [
  { ...ARCADE_STATION, id: 0, x: -11, z: 73.8 },
  { ...ARCADE_STATION, id: 1, x: -9.4, z: 73.8 },
  { ...ARCADE_STATION, id: 2, x: -7.8, z: 73.8 },
] as const;
export type ArcadeStation =
  (typeof ARCADE_STATIONS)[number] | (typeof ARCADE_STATION & { id: -1 });
export const LEGACY_ARCADE_STATION = { ...ARCADE_STATION, id: -1 } as const;
export function arcadeStation(id: number) {
  return ARCADE_STATIONS.find((s) => s.id === id);
}

/** Turn 45° toward the diagonal lakeside approach; legacy machines keep +Z. */
export function arcadeStationYaw(id: number) {
  return arcadeStation(id) ? Math.PI / 4 : 0;
}

/** Select the cabinet being approached, rather than its neighbour's nearer side panel. */
export function closestArcadeStation(
  x: number,
  z: number,
  stations: readonly ArcadeStation[] = ARCADE_STATIONS,
) {
  const near = stations.filter((s) => Math.hypot(x - s.x, z - s.z) < 2.3),
    candidates = near.length ? near : stations;
  const distance = (s: ArcadeStation) => {
    const yaw = arcadeStationYaw(s.id);
    return Math.hypot(
      x - s.x - Math.sin(yaw) * 1.2,
      z - s.z - Math.cos(yaw) * 1.2,
    );
  };
  return candidates.reduce((best, s) =>
    distance(s) < distance(best) ? s : best,
  );
}
