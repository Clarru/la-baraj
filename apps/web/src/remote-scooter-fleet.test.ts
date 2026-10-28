import { it, expect } from "vitest";
import * as THREE from "three";
import { cloneScooterRig } from "./scooter-resources";
import { rigMeshes, updateFleetInstances } from "./RemoteScooterFleet";

it("preserves each rider's world placement and independent steering/wheels in shared instance batches", () => {
  const entries = [0, 1].map((i) => {
    const parent = new THREE.Group(),
      anchor = new THREE.Group(),
      rig = cloneScooterRig();
    parent.position.set(i * 25, 2, -10);
    parent.rotation.y = i * 0.8;
    parent.add(anchor);
    anchor.position.set(0.2, 0, 0.5);
    rig.steering.rotation.y = i * 0.3;
    rig.frontWheel.rotation.x = i;
    return { anchor, rig, parts: rigMeshes(rig) };
  });
  const batches = entries[0].parts.map(
    (part) => new THREE.InstancedMesh(part.geometry, part.material, 50),
  );
  expect(batches.length).toBeLessThan(30);
  expect(
    entries[0].parts.some((p) => p.parent === entries[0].rig.kickstand),
  ).toBe(false);
  updateFleetInstances(entries, batches, new THREE.Matrix4());
  entries.forEach((entry, index) => {
    entry.parts.forEach((part, i) => {
      const actual = new THREE.Matrix4();
      batches[i].getMatrixAt(index, actual);
      const expected = new THREE.Matrix4().multiplyMatrices(
        entry.anchor.matrixWorld,
        part.matrixWorld,
      );
      actual.elements.forEach((v, j) =>
        expect(v).toBeCloseTo(expected.elements[j], 5),
      );
      expect(batches[i].count).toBe(2);
      expect(batches[i].boundingSphere?.radius).toBeGreaterThan(1);
    });
  });
  updateFleetInstances([], batches, new THREE.Matrix4());
  expect(batches.every((b) => b.count === 0 && !b.visible)).toBe(true);
  batches.forEach((b) => b.dispose());
});
