import {
  legalFleet,
  type GridPoint,
  type Plane,
} from "../../../packages/shared/planes";

/** Keep the grabbed part of the plane under the pointer, not just its cockpit. */
export function draggedPlane(
  plane: Plane,
  grabbed: GridPoint,
  target: GridPoint,
): Plane {
  return {
    ...plane,
    x: plane.x + target.x - grabbed.x,
    y: plane.y + target.y - grabbed.y,
  };
}

/** Rotate the grabbed cell with the plane so it stays under the pointer. */
export function rotateGrab(plane: Plane, grabbed: GridPoint): GridPoint {
  const dx = grabbed.x - plane.x,
    dy = grabbed.y - plane.y;
  return { x: plane.x - dy, y: plane.y + dx };
}

export function fleetWithPlane(
  fleet: readonly Plane[],
  index: number,
  plane: Plane,
): Plane[] {
  return fleet.map((original, i) => (i === index ? plane : original));
}

export function validPlacement(
  fleet: readonly Plane[],
  index: number,
  plane: Plane,
): boolean {
  return legalFleet(fleetWithPlane(fleet, index, plane));
}
