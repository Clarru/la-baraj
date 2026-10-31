import { MathUtils, Spherical, Vector3, type Camera } from "three";
const offset = new Vector3(),
  orbit = new Spherical();
/** A right-thumb angular velocity, independent of the movement pointer and screen refresh. */
export function applyMobileLook(
  camera: Camera,
  target: Vector3,
  input: { x: number; y: number },
  dt: number,
) {
  if ((!input.x && !input.y) || dt <= 0) return;
  offset.subVectors(camera.position, target);
  if (offset.lengthSq() < 0.001) return;
  orbit.setFromVector3(offset);
  const step = Math.min(dt, 0.05);
  orbit.theta -= input.x * 2.2 * step;
  orbit.phi = MathUtils.clamp(
    orbit.phi - input.y * 1.3 * step,
    0.15,
    Math.PI * 0.47,
  );
  camera.position.copy(target).add(offset.setFromSpherical(orbit));
  camera.lookAt(target);
}
