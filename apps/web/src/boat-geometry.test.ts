import { it, expect } from "vitest";
import * as THREE from "three";
import {
  BOAT_METRICS,
  applyBoatLean,
  boatGripPosition,
  createBoatRig,
  type BoatSide,
} from "./boat-geometry";
import { cloneBoatRig } from "./boat-resources";

const pivot = new THREE.Vector3(...BOAT_METRICS.wheelPivot);
const grip = (side: BoatSide, a: number) =>
  new THREE.Vector3(...boatGripPosition(side, a));

it("names every animated and structural part", () => {
  const rig = createBoatRig();
  for (const name of [
    "Motorboat_Stylized",
    "Hull",
    "Seat",
    "SteeringWheel",
    "Outboard",
  ])
    expect(
      name === "Motorboat_Stylized"
        ? rig.group
        : rig.group.getObjectByName(name),
    ).toBeDefined();
  expect(rig.group.name).toBe("Motorboat_Stylized");
  expect(rig.wheel).toBe(rig.group.getObjectByName("SteeringWheel"));
  expect(rig.hull).toBe(rig.group.getObjectByName("Hull"));
});

it("fits the declared footprint", () => {
  const box = new THREE.Box3().setFromObject(createBoatRig().group);
  const size = box.getSize(new THREE.Vector3());
  expect(Math.abs(size.z - BOAT_METRICS.length)).toBeLessThan(0.15);
  expect(Math.abs(size.x - BOAT_METRICS.beam)).toBeLessThan(0.15);
  expect(box.min.y).toBeGreaterThanOrEqual(-0.5);
  expect(box.max.y).toBeLessThan(1.4);
});

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

it("visible wheel agrees with boatGripPosition", () => {
  const rig = createBoatRig();
  for (const a of [0, 1.2, -2.4, Math.PI / 2]) {
    rig.wheelSpin.rotation.z = -a;
    rig.group.updateMatrixWorld(true);
    for (const side of ["left", "right"] as const) {
      const world = new THREE.Vector3(...BOAT_METRICS.grips[side]).applyMatrix4(
        rig.wheelSpin.matrixWorld,
      );
      expect(world.distanceTo(grip(side, a))).toBeLessThan(1e-6);
    }
  }
});

it("seat matches the bench sit clip height", () => {
  expect(BOAT_METRICS.seatHeight).toBe(0.45);
  const rig = createBoatRig();
  rig.group.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromObject(rig.group.getObjectByName("Seat")!)
    .max.y;
  expect(Math.abs(top - 0.45)).toBeLessThan(0.03);
});

it("positive lean dips the left side", () => {
  const rig = createBoatRig();
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

it("clones share geometry but not transforms", () => {
  const a = cloneBoatRig(),
    b = cloneBoatRig();
  const meshes = (root: THREE.Object3D) => {
    const result: THREE.Mesh[] = [];
    root.traverse((n) => {
      if (n instanceof THREE.Mesh) result.push(n);
    });
    return result;
  };
  expect(a.wheel).not.toBe(b.wheel);
  const first = meshes(a.wheel),
    second = meshes(b.wheel);
  expect(first.length).toBeGreaterThan(0);
  first.forEach((mesh, i) => {
    expect(mesh.geometry).toBe(second[i].geometry);
    expect(mesh).not.toBe(second[i]);
  });
  a.wheelSpin.rotation.z = 1;
  expect(b.wheelSpin.rotation.z).toBeCloseTo(0);
});
