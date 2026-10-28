/** One local, parkable QuickVolt 9. Shared with seating so riding excludes seated activities. */
export type VehicleState = {
  mounted: boolean;
  parked: [number, number, number];
  yaw: number;
  speed: number;
};
const state: VehicleState = {
  mounted: false,
  parked: [0, 0, 0],
  yaw: 0,
  speed: 0,
};
export function getVehicleState(): Readonly<VehicleState> {
  return state;
}
export function mountVehicle(): void {
  state.mounted = true;
  state.speed = 0;
}
export function parkVehicle(
  position: [number, number, number],
  yaw: number,
): void {
  state.mounted = false;
  state.parked = position;
  state.yaw = yaw;
  state.speed = 0;
}
export function updateVehicleMotion(yaw: number, speed: number): void {
  state.yaw = yaw;
  state.speed = speed;
}
