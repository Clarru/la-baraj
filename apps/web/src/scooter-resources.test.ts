import { it, expect } from "vitest";
import * as THREE from "three";
import { cloneScooterRig } from "./scooter-resources";

it("reuses scooter geometry but keeps each rider's steering, wheels and disposal independent", () => {
  const a = cloneScooterRig(),
    b = cloneScooterRig();
  const meshes = (rig: typeof a) => {
    const result: THREE.Mesh[] = [];
    rig.group.traverse((n) => {
      if (n instanceof THREE.Mesh) result.push(n);
    });
    return result;
  };
  const first = meshes(a),
    second = meshes(b);
  expect(first.length).toBeGreaterThan(10);
  first.forEach((mesh, i) => {
    expect(mesh.geometry).toBe(second[i].geometry);
    expect(mesh.material).toBe(second[i].material);
    expect(mesh).not.toBe(second[i]);
  });
  a.steering.rotation.y = 0.3;
  a.frontWheel.rotation.x = 1;
  expect(b.steering.rotation.y).toBeCloseTo(0);
  expect(b.frontWheel.rotation.x).toBeCloseTo(0);
  const disposed: string[] = [];
  first[0].geometry.addEventListener("dispose", () =>
    disposed.push("shared geometry"),
  );
  a.dispose();
  expect(disposed).toEqual([]);
  expect(new THREE.Box3().setFromObject(b.group).max.y).toBeGreaterThan(1.1);
});
