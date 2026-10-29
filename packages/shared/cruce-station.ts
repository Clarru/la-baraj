import { SEAT_ROOT_OFFSET } from "./seating.ts";
import type { CruceSeat } from "./cruce.ts";
/** Next to Planes, on the same flattened lakeside gathering clearing. */
export const CRUCE_TABLE = {
  x: 5,
  z: 68.37531356447997,
  ground: 0.7630894938951581,
};
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
    distance = 1.22 - SEAT_ROOT_OFFSET;
  return {
    position: [
      CRUCE_TABLE.x - Math.sin(angle) * distance,
      CRUCE_TABLE.ground + 0.07,
      CRUCE_TABLE.z + Math.cos(angle) * distance,
    ] as [number, number, number],
    yaw: Math.PI - angle,
  };
}
