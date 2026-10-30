import type { Object3D } from "three";
import { extractBoatRig, type BoatRig } from "./boat-geometry";

/**
 * One boat instance from the cached GLB scene. Object3D.clone shares geometry
 * and materials, so each boat owns only its node transforms (wheel, lean).
 */
export function cloneBoatRig(scene: Object3D): BoatRig {
  return extractBoatRig(scene.clone(true));
}
