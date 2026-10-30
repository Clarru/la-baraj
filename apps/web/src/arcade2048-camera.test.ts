import { it, expect } from "vitest";
import { Vector3 } from "three";
import { arcadeExitCamera } from "./arcade2048-camera";
it("pulls back to walking distance along the exact current sight line instead of resetting the heading", () => {
  for (const offset of [
    new Vector3(0, 0.15, 1.2),
    new Vector3(-1, 0.8, 0.7),
    new Vector3(2, 2, -2),
  ]) {
    const target = new Vector3(-9, 2, 74),
      position = target.clone().add(offset),
      player = new Vector3(-9, 1, 75),
      before = position.clone().sub(target).normalize(),
      exit = arcadeExitCamera(position, target, player);
    expect(exit.position.distanceTo(exit.target)).toBeCloseTo(4.8, 8);
    expect(
      exit.position.clone().sub(exit.target).normalize().dot(before),
    ).toBeCloseTo(1, 10);
    expect(exit.target.toArray()).toEqual([-9, 1.65, 75]);
    expect(position.toArray()).toEqual(target.clone().add(offset).toArray());
  }
});
it("retains an already distant camera and handles a coincident target without NaN", () => {
  const exit = arcadeExitCamera(
    new Vector3(0, 3, 10),
    new Vector3(),
    new Vector3(),
  );
  expect(exit.position.distanceTo(exit.target)).toBeCloseTo(Math.hypot(3, 10));
  const zero = arcadeExitCamera(new Vector3(), new Vector3(), new Vector3());
  expect(zero.position.toArray().every(Number.isFinite)).toBe(true);
  expect(zero.position.distanceTo(zero.target)).toBeCloseTo(4.8);
});
