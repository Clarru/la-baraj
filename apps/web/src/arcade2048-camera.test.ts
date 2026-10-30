import { it, expect } from "vitest";
import { Vector3 } from "three";
import { arcadeExitCamera, arcadeFocusCamera } from "./arcade2048-camera";
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

it("keeps the focused camera square to every rotated cabinet while preserving the legacy +Z view", () => {
  for (const id of [-1, 0, 1, 2])
    for (const aspect of [0.6, 1.6]) {
      const { position, target } = arcadeFocusCamera(id, 1, aspect),
        eye = position.clone().sub(target),
        horizontal = eye.clone().setY(0).normalize();
      const yaw = id < 0 ? 0 : Math.PI / 4;
      expect(
        horizontal.dot(new Vector3(Math.sin(yaw), 0, Math.cos(yaw))),
      ).toBeCloseTo(1, 10);
      expect(Math.atan2(eye.y, Math.hypot(eye.x, eye.z))).toBeCloseTo(
        (8 * Math.PI) / 180,
        10,
      );
      expect(target.y).toBeCloseTo(2.321, 10);
      expect(eye.length()).toBeGreaterThanOrEqual(1.12 - 1e-10);
    }
});
