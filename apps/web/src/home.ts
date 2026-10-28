import { cabinSpots, inWater, roads, segmentDistance, terrainHeight } from "./geography";
import { cabinDesignForPlot, cabinYaw } from "./cabin-designs";
import { cabinDoor, cabinLocalToWorld } from "./cabin-interior-state";

const key = "lake-cincis-home-v1";
type HomeStorage = Pick<Storage, "getItem" | "setItem">;
const memoryHomes = new Map<string, number>();
export function isHomeIndex(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < cabinSpots.length;
}
/** Offline preview only. Online assignments always come from the room authority. */
export function readLocalHome(storage?: HomeStorage, options: { roomId?: string; random?: () => number } = {}): number {
  const storageKey = options.roomId ? `${key}:${options.roomId}` : key;
  const randomHome = () => Math.max(0, Math.min(cabinSpots.length - 1, Math.floor((options.random?.() ?? crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) * cabinSpots.length)));
  try {
    const store = storage ?? window.localStorage;
    const saved = JSON.parse(store.getItem(storageKey) ?? "null");
    if (isHomeIndex(saved?.plotIndex)) return saved.plotIndex;
    const fallback = memoryHomes.get(storageKey) ?? randomHome();
    memoryHomes.set(storageKey, fallback);
    store.setItem(storageKey, JSON.stringify({ plotIndex: fallback }));
    return fallback;
  } catch {
    const fallback = memoryHomes.get(storageKey) ?? randomHome();
    memoryHomes.set(storageKey, fallback);
    return fallback;
  }
}
export function displayedHomeIndex(assigned: number | null | undefined, local: number): number {
  return isHomeIndex(assigned) ? assigned : local;
}
export function shouldSpawnAtHome(previous: number | null, assigned: number): boolean {
  return isHomeIndex(assigned) && previous !== assigned;
}
export type HomeSpawn = { index: number; position: [number, number, number]; yaw: number; scooter: [number, number, number] };
function outsideRoadEdges(x: number, z: number) {
  return roads.every((road) => {
    if (["steps", "path", "track", "footway", "cycleway", "bridleway"].includes(road.kind)) return true;
    const halfWidth = ["tertiary", "secondary", "primary"].includes(road.kind) ? 2.8 : 1.8;
    return road.points.slice(1).every((point, i) => segmentDistance(x, z, road.points[i], point) >= halfWidth + 0.45);
  });
}
/** Keep the full capsule beyond the authored front steps and the scooter beside the arrival. */
export function homeSpawn(index: number): HomeSpawn {
  if (!isHomeIndex(index)) throw new RangeError("Unknown home");
  const design = cabinDesignForPlot(index), door = cabinDoor(index);
  const front = Math.max(design.stairZ + 2, door.outsideZ + 3, ...design.porches.map((porch) => porch.maxZ + 1.6));
  // The first candidate is immediately beyond the front steps. Extra candidates protect future plot changes.
  for (const advance of [0, -0.6, -0.75, 0.8, 1.6]) {
    for (const offset of [0, -1.5, 1.5, -3, 3, -4.5, 4.5, -6, 6]) {
      if (front + advance < design.stairZ + 1.25) continue;
      const point = cabinLocalToWorld(index, design.stairX + offset, front + advance);
      const scooter = cabinLocalToWorld(index, design.stairX + offset + 1.7, front + advance + 0.35);
      if ([point, scooter].some((candidate) => inWater(candidate.x, candidate.z) || !outsideRoadEdges(candidate.x, candidate.z))) continue;
      return { index, position: [point.x, terrainHeight(point.x, point.z), point.z], yaw: cabinYaw(index), scooter: [scooter.x, terrainHeight(scooter.x, scooter.z), scooter.z] };
    }
  }
  throw new Error(`No clear arrival beside cabin ${index + 1}`);
}
export type NavigationSample = { x: number; z: number; heading: number };
export function playerMapRotation(heading: number) {
  return 180 - (heading * 180) / Math.PI;
}
export function mapHomePosition(
  home: { x: number; z: number },
  center: { x: number; z: number },
  range: number,
) {
  const inset = range * 0.085,
    half = range / 2 - inset;
  const dx = home.x - center.x,
    dz = home.z - center.z;
  const scale = Math.max(1, Math.abs(dx) / half, Math.abs(dz) / half);
  return {
    x: center.x + dx / scale,
    z: center.z + dz / scale,
    offscreen: scale > 1,
  };
}

/** Keep the initial follow camera on the open side of the cabin, not inside its roof. */
export function homeWalkCameraOffset(index: number): [number, number, number] {
  const yaw = cabinYaw(index);
  return [5 * Math.cos(yaw) + 7 * Math.sin(yaw), 3.4, -5 * Math.sin(yaw) + 7 * Math.cos(yaw)];
}
