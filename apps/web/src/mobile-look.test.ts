import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { applyMobileLook } from "./mobile-look";
describe("independent right-thumb look", () => {
  it.each([30, 60, 120])(
    "turns the same angle over a second at %s updates/s without zoom or pan",
    (rate) => {
      const camera = new PerspectiveCamera(),
        target = new Vector3(5, 2, 3);
      camera.position.copy(target).add(new Vector3(0, 4, 10));
      const radius = camera.position.distanceTo(target);
      for (let i = 0; i < rate; i++)
        applyMobileLook(camera, target, { x: 1, y: 0 }, 1 / rate);
      const offset = camera.position.clone().sub(target);
      expect(Math.atan2(offset.x, offset.z)).toBeCloseTo(-2.2);
      expect(camera.position.distanceTo(target)).toBeCloseTo(radius);
      expect(target.toArray()).toEqual([5, 2, 3]);
    },
  );
  it("bounds vertical look and stops immediately on release", () => {
    const camera = new PerspectiveCamera(),
      target = new Vector3();
    camera.position.set(0, 4, 10);
    for (let i = 0; i < 400; i++)
      applyMobileLook(camera, target, { x: 0, y: -1 }, 1 / 60);
    const held = camera.position.clone();
    expect(Math.acos(held.y / held.length())).toBeCloseTo(Math.PI * 0.47);
    applyMobileLook(camera, target, { x: 0, y: 0 }, 1);
    expect(camera.position.equals(held)).toBe(true);
  });
});
