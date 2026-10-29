import { describe, expect, it } from "vitest";
import { planeCells, type Plane } from "../../../packages/shared/planes";
import {
  draggedPlane,
  fleetWithPlane,
  rotateGrab,
  validPlacement,
} from "./plane-placement";

const fleet: Plane[] = [
  { x: 2, y: 0, rotation: 0 },
  { x: 7, y: 0, rotation: 0 },
  { x: 4, y: 6, rotation: 0 },
];
describe("moving planes", () => {
  it("preserves the grabbed part under the pointer", () => {
    const moved = draggedPlane(fleet[0], { x: 0, y: 1 }, { x: 1, y: 3 });
    expect(moved).toEqual({ x: 3, y: 2, rotation: 0 });
    expect(planeCells(moved)).toContainEqual({ x: 1, y: 3 });
  });
  it("allows the original footprint and rejects overlap or off-grid placement", () => {
    expect(validPlacement(fleet, 0, fleet[0])).toBe(true);
    expect(validPlacement(fleet, 0, { x: 7, y: 0, rotation: 0 })).toBe(false);
    expect(validPlacement(fleet, 0, { x: 0, y: 0, rotation: 0 })).toBe(false);
    expect(validPlacement(fleet, 0, { x: -1, y: 5, rotation: 0 })).toBe(false);
    expect(fleetWithPlane(fleet, 0, fleet[1])[1]).toEqual(fleet[1]);
    expect(fleet[0]).toEqual({ x: 2, y: 0, rotation: 0 });
  });
  it("checks a rotated preview against the entire board and the other planes", () => {
    const rotated = { ...fleet[0], rotation: 1 };
    expect(validPlacement(fleet, 0, rotated)).toBe(false);
    expect(validPlacement(fleet, 0, { ...rotated, x: 3, y: 4 })).toBe(true);
  });
  it("keeps a grabbed wing under the pointer when rotating during a drag", () => {
    const plane = fleet[0],
      grabbed = { x: 0, y: 1 },
      target = { x: 6, y: 5 };
    const rotated = { ...plane, rotation: 1 };
    const preview = draggedPlane(rotated, rotateGrab(plane, grabbed), target);
    expect(planeCells(preview)).toContainEqual(target);
  });
});
