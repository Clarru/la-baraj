/** Compatibility handoff for the concurrent seating task. The vehicle is now a QuickVolt 9 scooter. */
export type { VehicleState as BmxState } from "./vehicle-state";
export {
  getVehicleState as getBmxState,
  mountVehicle as mountBmx,
  parkVehicle as parkBmx,
  updateVehicleMotion as updateBmxMotion,
} from "./vehicle-state";
