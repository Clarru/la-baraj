/** The west picnic table, on the existing flattened lakeside gathering clearing. */
import { SEAT_ROOT_OFFSET } from "./seating.ts";
export const PLANES_TABLE = {
  id: "picnic-planes",
  x: -5,
  z: 68.37531356447997,
  ground: 0.7630894938951581,
};
export const PLANES_SEATS = [
  "planes-north:seat:0",
  "planes-south:seat:0",
] as const;
export const PLANES_RECONNECT_MS = 30_000;
export function planesSeatSide(seatId: unknown): 0 | 1 | null {
  return seatId === PLANES_SEATS[0] ? 0 : seatId === PLANES_SEATS[1] ? 1 : null;
}
export function planesSeatPose(side: 0 | 1) {
  return {
    position: [
      PLANES_TABLE.x +
        (side === 0 ? -1 + SEAT_ROOT_OFFSET : 1.05 - SEAT_ROOT_OFFSET),
      PLANES_TABLE.ground + 0.07,
      PLANES_TABLE.z,
    ] as [number, number, number],
    yaw: side === 0 ? Math.PI / 2 : -Math.PI / 2,
  };
}
