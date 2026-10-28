import { cabinSpots, terrainHeight } from "./geography";
import { cabinDesignForPlot, cabinYaw } from "./cabin-designs";
export const roomNames = ["Timber", "AFrame", "Sage"] as const;
export const roomSizes = [
  { width: 5.3, depth: 5.5 },
  { width: 5.6, depth: 5.5 },
  { width: 5.9, depth: 5.3 },
] as const;
export const interiorFloorOffset = 0.64;
export type CabinTransfer = {
  position: [number, number, number];
  facing: number;
  from?: [number, number, number];
  duration?: number;
};
let pending: CabinTransfer | null = null;
export function cabinLocalToWorld(
  index: number,
  x: number,
  z: number,
): { x: number; z: number } {
  const cabin = cabinSpots[index];
  if (!cabin) throw new RangeError("Unknown cabin");
  const yaw = cabinYaw(index),
    cos = Math.cos(yaw),
    sin = Math.sin(yaw);
  return { x: cabin.x + x * cos + z * sin, z: cabin.z - x * sin + z * cos };
}
export function cabinDoor(index: number) {
  const design = cabinDesignForPlot(index),
    family = design.family;
  return {
    x: [1.63, 0.65, 1.7][family],
    outsideZ: [3.12, 3.27, 2.97][family],
    insideZ: [3.12, 3.27, 2.97][family],
    roomOffsetZ: [3.12, 3.27, 2.97][family] - roomSizes[family].depth / 2,
  };
}
export function cabinTransfer(index: number, entering: boolean): CabinTransfer {
  const cabin = cabinSpots[index];
  if (!cabin) throw new RangeError("Unknown cabin");
  const door = cabinDoor(index),
    p = cabinLocalToWorld(
      index,
      door.x,
      entering ? door.insideZ - 0.85 : door.outsideZ + 1.05,
    );
  return {
    position: [
      p.x,
      terrainHeight(cabin.x, cabin.z) + interiorFloorOffset + 0.95,
      p.z,
    ],
    facing: cabinYaw(index) + (entering ? Math.PI : 0),
  };
}
export function queueCabinTransfer(
  index: number,
  entering: boolean,
  walkThrough = false,
) {
  pending = cabinTransfer(index, entering);
  if (walkThrough) {
    pending.from = cabinTransfer(index, !entering).position;
    pending.duration = 0.72;
  }
}
export function sampleCabinTransfer(
  transfer: CabinTransfer,
  elapsed: number,
): [number, number, number] {
  if (!transfer.from || !transfer.duration) return transfer.position;
  const t = Math.max(0, Math.min(1, elapsed / transfer.duration));
  const eased = t * t * (3 - 2 * t);
  return transfer.position.map(
    (value, i) => transfer.from![i] + (value - transfer.from![i]) * eased,
  ) as [number, number, number];
}
export function takeCabinTransfer() {
  const next = pending;
  pending = null;
  return next;
}
export function clearCabinTransfer() {
  pending = null;
}
export function nearestCabinDoor(
  position: { x: number; z: number },
  radius = 2.3,
): number | null {
  let result: number | null = null,
    distance = radius;
  for (const cabin of cabinSpots) {
    const door = cabinDoor(cabin.i),
      p = cabinLocalToWorld(cabin.i, door.x, door.outsideZ + 0.6);
    const next = Math.hypot(position.x - p.x, position.z - p.z);
    if (next < distance) {
      distance = next;
      result = cabin.i;
    }
  }
  return result;
}
