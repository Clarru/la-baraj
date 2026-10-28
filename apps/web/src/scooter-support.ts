import { Ray, type World, type RigidBody } from "@dimforge/rapier3d-compat";
/** Use the surface actually beneath the rider, including porches and docks. */
export function scooterSupportHeight(
  world: World,
  x: number,
  z: number,
  fromY: number,
  exclude?: RigidBody,
): number | undefined {
  const hit = world.castRay(
    new Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }),
    3,
    true,
    undefined,
    undefined,
    undefined,
    exclude,
  );
  return hit ? fromY - hit.timeOfImpact : undefined;
}
