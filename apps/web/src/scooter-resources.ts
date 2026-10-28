import type { Group } from "three";
import { createScooterRig, type ScooterRig } from "./scooter-geometry";

// Like a loaded GLB: one immutable page-lifetime geometry/material cache, with
// independent steering and wheel transforms for each rider. No duplicate bake.
let template: ScooterRig | undefined;
export function cloneScooterRig(): ScooterRig {
  template ??= createScooterRig();
  const group = template.group.clone(true);
  const part = (name: string) => group.getObjectByName(name) as Group;
  return {
    group,
    steering: part("Steering"),
    frontWheel: part("FrontWheel"),
    rearWheel: part("RearWheel"),
    kickstand: part("Kickstand_ParkedOnly"),
    // React owns the cloned transforms; cached geometry/materials outlive one rider.
    dispose() {},
  };
}
