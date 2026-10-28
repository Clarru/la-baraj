import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { makeTerrain, makeLakeBoundary } from "./environment";
import { inWater, southShore } from "./geography";

beforeAll(async () => {
  await RAPIER.init();
});
describe("shore collision regression", () => {
  it("has one visible ground surface and matching collision under the inhabited shore", () => {
    const patches = makeTerrain();
    const world = new RAPIER.World({ x: 0, y: -12, z: 0 });
    const meshes = patches.map((geometry) => {
      world.createCollider(
        RAPIER.ColliderDesc.trimesh(
          new Float32Array(geometry.attributes.position.array),
          new Uint32Array(geometry.index!.array),
        ),
      );
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      );
      mesh.updateMatrixWorld();
      return mesh;
    });
    world.step();
    for (const x of [-290.7, -189.7, -70.7, 49.3, 179.3, 300.3]) {
      for (const offset of [1.3, 5.3, 15.3, 28.3]) {
        const z = southShore(x) + offset;
        const ray = new THREE.Raycaster(
          new THREE.Vector3(x, 100, z),
          new THREE.Vector3(0, -1, 0),
        );
        const hits = ray.intersectObjects(meshes);
        expect(hits).toHaveLength(1);
        const hit = world.castRay(
          new RAPIER.Ray({ x, y: 100, z }, { x: 0, y: -1, z: 0 }),
          200,
          true,
        );
        expect(hit).not.toBeNull();
        expect(100 - hit!.timeOfImpact).toBeCloseTo(hits[0].point.y, 3);
      }
    }
    world.free();
    patches.forEach((g) => g.dispose());
    // Full terrain triangulation and WASM collider setup exceed 5s on CI runners.
  }, 15_000);
  it("physically stops a player capsule approaching the lake without a reset", () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const [vertices, indices] = makeLakeBoundary();
    world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices));
    const x = 50,
      z = southShore(x) + 3;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, 1, z)
        .lockRotations()
        .setCcdEnabled(true),
    );
    world.createCollider(RAPIER.ColliderDesc.capsule(0.35, 0.3), body);
    for (let i = 0; i < 180; i++) {
      body.setLinvel({ x: 0, y: 0, z: -4 }, true);
      world.step();
    }
    const p = body.translation();
    expect(inWater(p.x, p.z)).toBe(false);
    expect(p.z).toBeGreaterThan(southShore(p.x));
    expect(Math.abs(p.x - x)).toBeLessThan(5);
    world.free();
  });
});
