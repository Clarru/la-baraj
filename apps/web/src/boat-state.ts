import { boatDockSpawn, nearestDockSpawn } from "./boat-placement";
import { getVehicleState } from "./vehicle-state";

/** One local, parkable personal motorboat. Shared with seating so driving excludes seated activities. */
export type BoatState = {
  mounted: boolean;
  parked: [number, number, number];
  yaw: number;
  speed: number;
  velocity: [number, number];
};
const spawn = boatDockSpawn(0);
const state: BoatState = {
  mounted: false,
  parked: spawn.position,
  yaw: spawn.yaw,
  speed: 0,
  velocity: [0, 0],
};
export function getBoatState(): Readonly<BoatState> {
  return state;
}
export function mountBoat(): void {
  state.mounted = true;
  state.speed = 0;
  state.velocity = [0, 0];
}
export function parkBoat(
  position: [number, number, number],
  yaw: number,
): void {
  state.mounted = false;
  state.parked = position;
  state.yaw = yaw;
  state.speed = 0;
  state.velocity = [0, 0];
}
export function updateBoatMotion(
  yaw: number,
  speed: number,
  velocity: [number, number] = [Math.sin(yaw) * speed, Math.cos(yaw) * speed],
): void {
  state.yaw = yaw;
  state.speed = speed;
  state.velocity = velocity;
}
/** Return the boat to the dock nearest the player's home. */
export function resetBoatToDock(homeX: number, homeIndex?: number): void {
  const dock = nearestDockSpawn(homeX, homeIndex);
  parkBoat(dock.position, dock.yaw);
}
/** Riding the scooter or driving the boat; either excludes seated activities. */
export function vehicleOccupied(): boolean {
  return getVehicleState().mounted || state.mounted;
}
