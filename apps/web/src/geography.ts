import { MAX_HOMES } from "../../../packages/shared/protocol";
import shoreline from "../../../assets/geography/lake-cincis-shoreline.geojson?raw";
import roadData from "../../../assets/geography/lake-cincis-roads.geojson?raw";
export type Point = [number, number];
// Owner revision: geographic distances expanded 5x; uniform 0.75x real scale.
// Topology comes from OSM. Heights are a procedural proxy, NOT imported DEM.
export const SCALE = 0.75;
export const WORLD_EXPANSION = 5;
export const centralShore = () => southShore(0);
export function project([lon, lat]: number[]): Point {
  return [
    (lon - 22.864) * 111195 * Math.cos((45.69 * Math.PI) / 180) * SCALE,
    -(lat - 45.69) * 111195 * SCALE,
  ];
}
export const lake: Point[] =
  JSON.parse(shoreline).features[0].geometry.coordinates[0].map(project);
export const roads: { kind: string; points: Point[] }[] = JSON.parse(
  roadData,
).features.map(
  (f: {
    properties: { highway: string };
    geometry: { coordinates: number[][] };
  }) => ({
    kind: f.properties.highway,
    points: f.geometry.coordinates.map(project),
  }),
);
export function inWater(x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = lake.length - 1; i < lake.length; j = i++) {
    const [ax, az] = lake[i],
      [bx, bz] = lake[j];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      inside = !inside;
  }
  return inside;
}
export function segmentDistance(
  x: number,
  z: number,
  a: Point,
  b: Point,
): number {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)),
  );
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
export function shoreDistance(x: number, z: number): number {
  let min = Infinity;
  for (let i = 1; i < lake.length; i++)
    min = Math.min(min, segmentDistance(x, z, lake[i - 1], lake[i]));
  return min;
}
export function southShore(x: number): number {
  const hits: number[] = [];
  for (let i = 1; i < lake.length; i++) {
    const a = lake[i - 1],
      b = lake[i];
    if (x >= Math.min(a[0], b[0]) && x < Math.max(a[0], b[0]))
      hits.push(a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
  }
  return hits.length ? Math.max(...hits) : 20;
}
export function northShore(x: number): number {
  const hits: number[] = [];
  for (let i = 1; i < lake.length; i++) {
    const a = lake[i - 1],
      b = lake[i];
    if (x >= Math.min(a[0], b[0]) && x < Math.max(a[0], b[0]))
      hits.push(a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
  }
  return hits.length ? Math.min(...hits) : -550;
}
// Select the real southern road crossing at each cabin cluster, excluding footpaths.
export function settlementRoadZ(x: number): number {
  const shore = southShore(x),
    hits: number[] = [];
  for (const road of roads) {
    if (
      ![
        "secondary",
        "tertiary",
        "primary",
        "unclassified",
        "residential",
      ].includes(road.kind)
    )
      continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i];
      if (x >= Math.min(a[0], b[0]) && x < Math.max(a[0], b[0])) {
        const z = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
        if (z > shore + 25 && z < shore + 220) hits.push(z);
      }
    }
  }
  return hits.length ? Math.min(...hits) : shore + 80;
}
function baseTerrainHeight(
  x: number,
  z: number,
  d?: number,
  water?: boolean,
): number {
  const distance = d ?? shoreDistance(x, z);
  if (water ?? inWater(x, z)) return Math.max(-1.1, 0.12 - distance * 0.18);
  return (
    0.12 +
    Math.min(distance, 160) * 0.1 +
    Math.max(0, distance - 60) *
      0.075 *
      (Math.sin(x * 0.004) * Math.cos(z * 0.003) + 1)
  );
}
export const fishingSpots = [55, 0, -235].map((x) => ({
  x,
  z: southShore(x) + 3,
}));
export function activityClearance(x: number, z: number): boolean {
  return (
    !fishingSpots.some((p) => Math.hypot(x - p.x, z - p.z) < 7) &&
    !sharedGrounds.some((p) => Math.hypot(x - p.x, z - p.z) < 11)
  );
}
export const sharedGrounds = [
  { x: 0, z: southShore(0) + 9 },
  { x: 36, z: southShore(36) + 17 },
].map((p) => ({ ...p, ground: baseTerrainHeight(p.x, p.z) }));
// Compact southern-road plots, filled nearest the gathering fire first.
// These are placement candidates, not prebuilt houses: ownership controls rendering.
export const cabinSpots = (() => {
  const focus = sharedGrounds[1];
  const candidates: { x: number; z: number; uphill: boolean; roadZ: number }[] =
    [];
  for (const row of [-14, 15, 36, 57])
    for (let column = -18; column <= 18; column++) {
      const x = focus.x + column * 21 + (row > 15 ? 10.5 : 0);
      const roadZ = settlementRoadZ(x),
        z = roadZ + row;
      if (inWater(x, z) || z < southShore(x) + 22 || !activityClearance(x, z))
        continue;
      if (sharedGrounds.some((p) => Math.hypot(x - p.x, z - p.z) < 26))
        continue;
      if (roadDistance(x, z) < 10) continue;
      candidates.push({ x, z, uphill: z > roadZ, roadZ });
    }
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - focus.x, a.z - focus.z) -
        Math.hypot(b.x - focus.x, b.z - focus.z) ||
      a.x - b.x ||
      a.z - b.z,
  );
  const selected: typeof candidates = [];
  for (const p of candidates) {
    if (selected.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= 20))
      selected.push(p);
    if (selected.length === MAX_HOMES) break;
  }
  if (selected.length !== MAX_HOMES)
    throw new Error("Not enough clear village plots");
  return selected.map((p, i) => ({
    ...p,
    i,
    ground: baseTerrainHeight(p.x, p.z),
    seed: 8100 + i * 137,
  }));
})();
export function terrainHeight(
  x: number,
  z: number,
  d?: number,
  water?: boolean,
): number {
  if (water ?? inWater(x, z)) return baseTerrainHeight(x, z, d, true);
  let h = baseTerrainHeight(x, z, d, false);
  for (const c of cabinSpots) {
    const radius = Math.hypot(x - c.x, z - c.z);
    if (radius < 12)
      h = c.ground + (h - c.ground) * Math.max(0, (radius - 8) / 4);
  }
  for (const p of sharedGrounds) {
    const radius = Math.hypot(x - p.x, z - p.z);
    if (radius < 11)
      h = p.ground + (h - p.ground) * Math.max(0, (radius - 6) / 5);
  }
  return h;
}
export function roadDistance(x: number, z: number): number {
  let d = Infinity;
  for (const r of roads)
    for (let i = 1; i < r.points.length; i++)
      d = Math.min(d, segmentDistance(x, z, r.points[i - 1], r.points[i]));
  return d;
}
export function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function canPlant(x: number, z: number): boolean {
  return (
    !inWater(x, z) &&
    activityClearance(x, z) &&
    shoreDistance(x, z) > 4 &&
    roadDistance(x, z) > 2.2 &&
    !cabinSpots.some((c) => Math.hypot(x - c.x, z - c.z) < 18) &&
    Math.hypot(x - 4, z - (southShore(0) + 12)) > 16
  );
}
