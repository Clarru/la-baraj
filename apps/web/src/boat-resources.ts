import type { Group } from "three";
import { createBoatRig, type BoatRig } from "./boat-geometry";

// Like a loaded GLB: one immutable page-lifetime geometry/material cache, with
// independent wheel and lean transforms per instance. No duplicate bake.
let template: BoatRig | undefined;
export function cloneBoatRig(): BoatRig {
  template ??= createBoatRig();
  const group = template.group.clone(true);
  const part = (name: string) => group.getObjectByName(name) as Group;
  return {
    group,
    wheel: part("SteeringWheel"),
    wheelSpin: part("WheelSpin"),
    hull: part("Hull"),
    // React owns the cloned transforms; cached geometry/materials outlive one boat.
    dispose() {},
  };
}
