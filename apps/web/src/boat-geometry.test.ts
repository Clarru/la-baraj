import { it, expect } from "vitest";
import * as THREE from "three";
import {
  BOAT_METRICS,
  applyBoatLean,
  boatGripPosition,
  type BoatSide,
} from "./boat-geometry";
import { cloneBoatRig } from "./boat-resources";
import { loadRunabout } from "./runabout-test-model";

const pivot = new THREE.Vector3(...BOAT_METRICS.wheelPivot);
const grip = (side: BoatSide, a: number) =>
  new THREE.Vector3(...boatGripPosition(side, a));

// Covers the transitional boatGripPosition shim boat-rider reads until Task 3.
it("grips sit on the rim and turn with the wheel", () => {
  for (const a of [0, 1.2, -2.4])
    for (const side of ["left", "right"] as const)
      expect(Math.abs(grip(side, a).distanceTo(pivot) - 0.19)).toBeLessThan(
        0.01,
      );
  const left = grip("left", 0),
    right = grip("right", 0);
  // Mirrored across the boat's centre plane at angle 0.
  expect(left.x).toBeCloseTo(-right.x);
  expect(left.y).toBeCloseTo(right.y);
  expect(left.z).toBeCloseTo(right.z);
  // The rim's top at angle 0, in boat space: tilt applied to local +Y.
  const top = new THREE.Vector3(0, BOAT_METRICS.wheelRadius, 0)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), BOAT_METRICS.wheelTilt)
    .add(pivot);
  expect(grip("left", Math.PI / 2).distanceTo(top)).toBeLessThan(0.02);
});

it("positive lean dips the left side", async () => {
  const rig = cloneBoatRig(await loadRunabout("Lake_Runabout"));
  applyBoatLean(rig, 0.06);
  expect(rig.group.rotation.z).toBeCloseTo(-0.06);
  rig.group.updateMatrixWorld(true);
  const left = new THREE.Vector3(0.7, 0.5, 0).applyMatrix4(
    rig.group.matrixWorld,
  );
  const right = new THREE.Vector3(-0.7, 0.5, 0).applyMatrix4(
    rig.group.matrixWorld,
  );
  expect(left.y).toBeLessThan(right.y);
});

it("clones share geometry but not transforms", async () => {
  const scene = await loadRunabout("Lake_Runabout");
  const a = cloneBoatRig(scene),
    b = cloneBoatRig(scene);
  const meshes = (root: THREE.Object3D) => {
    const result: THREE.Mesh[] = [];
    root.traverse((n) => {
      if (n instanceof THREE.Mesh) result.push(n);
    });
    return result;
  };
  expect(a.wheel).not.toBe(b.wheel);
  const first = meshes(a.group),
    second = meshes(b.group);
  expect(first.length).toBeGreaterThan(0);
  first.forEach((mesh, i) => {
    expect(mesh.geometry).toBe(second[i].geometry);
    expect(mesh.material).toBe(second[i].material);
    expect(mesh).not.toBe(second[i]);
  });
  a.wheelSpin.rotation.z = 1;
  expect(b.wheelSpin.rotation.z).toBeCloseTo(0);
});
