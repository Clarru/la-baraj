import { it, expect } from "vitest";
import * as THREE from "three";
import { applyBoatLean, extractBoatRig, remoteDriverOffset } from "./boat-geometry";
import { cloneBoatRig } from "./boat-resources";
import { loadRunabout } from "./runabout-test-model";

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

it("remote drivers sit in the starboard seat", async () => {
  const lod = extractBoatRig(await loadRunabout("Lake_Runabout_LOD"));
  const full = extractBoatRig(await loadRunabout("Lake_Runabout"));
  const seat = remoteDriverOffset(lod, new THREE.Vector3());
  expect(seat.x).toBeLessThan(-0.2);
  expect(seat.distanceTo(remoteDriverOffset(full, new THREE.Vector3()))).toBeLessThan(0.02);
});
