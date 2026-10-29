import { boatDockSpawn } from "./boat-placement";

/** One local, parkable personal motorboat. Shared with seating so driving excludes seated activities. */
export type BoatState = {
  mounted: boolean;
  parked: [number, number, number];
  yaw: number;
  speed: number;
};
const spawn = boatDockSpawn(0);
const state: BoatState = {
  mounted: false,
  parked: spawn.position,
  yaw: spawn.yaw,
  speed: 0,
};
export function getBoatState(): Readonly<BoatState> {
  return state;
}
export function mountBoat(): void {
  state.mounted = true;
  state.speed = 0;
}
export function parkBoat(
  position: [number, number, number],
  yaw: number,
): void {
  state.mounted = false;
  state.parked = position;
  state.yaw = yaw;
  state.speed = 0;
}
export function updateBoatMotion(yaw: number, speed: number): void {
  state.yaw = yaw;
  state.speed = speed;
}
