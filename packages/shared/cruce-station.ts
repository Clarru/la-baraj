import { SEAT_ROOT_OFFSET } from "./seating.ts";
import type { CruceSeat } from "./cruce.ts";
/** Next to Planes, on the same flattened lakeside gathering clearing. */
export const CRUCE_TABLE = {
  x: 5,
  z: 68.37531356447997,
  ground: 0.7630894938951581,
  halfWidth: 0.8,
  surface: 0.82,
  /** Frame timber is below the felt and bolt maxima. */
  woodSurface: 0.817,
  benchRadius: 1.46,
  benchWidth: 1.12,
  benchDepth: 0.44,
  seatHeight: 0.47,
  /** Wooden plank top; bolt heads reach seatHeight. */
  seatSurface: 0.467,
};
/** Retained pants under-hip contact measured from the deformed Activity_Sit mesh. */
export const CRUCE_CHARACTER_SEAT_HEIGHT = 0.4667;
export const CRUCE_SEATS = [
  "cruce-south:seat:0",
  "cruce-west:seat:0",
  "cruce-north:seat:0",
  "cruce-east:seat:0",
] as const;
export const CRUCE_RECONNECT_MS = 30_000;
export function cruceSeatSide(id: unknown): CruceSeat | null {
  const side = CRUCE_SEATS.findIndex((s) => s === id);
  return side < 0 ? null : (side as CruceSeat);
}
export function cruceSeatPose(seat: CruceSeat) {
  const angle = (seat * Math.PI) / 2,
    distance = CRUCE_TABLE.benchRadius - SEAT_ROOT_OFFSET;
  return {
    position: [
      CRUCE_TABLE.x - Math.sin(angle) * distance,
      CRUCE_TABLE.ground +
        CRUCE_TABLE.seatSurface -
        CRUCE_CHARACTER_SEAT_HEIGHT,
      CRUCE_TABLE.z + Math.cos(angle) * distance,
    ] as [number, number, number],
    yaw: Math.PI - angle,
  };
}

export function crucePlayTarget(seat: CruceSeat) {
  const a = (seat * Math.PI) / 2;
  return [
    CRUCE_TABLE.x - Math.sin(a) * 0.18,
    CRUCE_TABLE.ground + CRUCE_TABLE.surface + 0.009,
    CRUCE_TABLE.z + Math.cos(a) * 0.18,
  ] as [number, number, number];
}
