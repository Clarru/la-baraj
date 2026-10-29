import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { makeTerrain } from "./environment";
import { inWater, southShore, terrainHeight } from "./geography";
import { LAKE_LEVEL, swimVelocity, swimmingState } from "./swim-motion";

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
  it("allows a capsule to cross the shoreline and float in the lake", () => {
    const world = new RAPIER.World({ x: 0, y: -12, z: 0 });
    const patches = makeTerrain();
    for (const geometry of patches)
      world.createCollider(
        RAPIER.ColliderDesc.trimesh(
          new Float32Array(geometry.attributes.position.array),
          new Uint32Array(geometry.index!.array),
        ),
      );
    const x = 50,
      shore = southShore(x);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, terrainHeight(x, shore + 2) + 0.95, shore + 2)
        .lockRotations()
        .setCcdEnabled(true),
    );
    world.createCollider(RAPIER.ColliderDesc.capsule(0.35, 0.3), body);
    let swimming = false,
      entered = false;
    for (let i = 0; i < 360; i++) {
      const p = body.translation(),
        wet = inWater(p.x, p.z);
      const ground = wet ? terrainHeight(p.x, p.z, undefined, true) : 0;
      swimming = swimmingState({
        swimming,
        inLake: wet,
        depth: LAKE_LEVEL - ground,
        bodyY: p.y,
        indoors: false,
        occupied: false,
      });
      if (swimming) {
        entered = true;
        body.setGravityScale(0, true);
        body.setLinvel(
          swimVelocity({
            velocity: body.linvel(),
            direction: { x: 0, z: -1 },
            bodyY: p.y,
            groundY: ground,
            time: i / 60,
            dt: 1 / 60,
          }),
          true,
        );
      } else {
        body.setGravityScale(1, true);
        const v = body.linvel();
        body.setLinvel({ x: 0, y: v.y, z: -3 }, true);
      }
      world.step();
    }
    const p = body.translation();
    expect(entered).toBe(true);
    expect(inWater(p.x, p.z)).toBe(true);
    expect(p.z).toBeLessThan(shore - 5);
    expect(p.y).toBeGreaterThan(LAKE_LEVEL + 0.3);
    expect(p.y).toBeLessThan(LAKE_LEVEL + 0.7);
    let reachedShallows = false;
    for (let i = 0; i < 600; i++) {
      const position = body.translation();
      const wet = inWater(position.x, position.z);
      const ground = wet
        ? terrainHeight(position.x, position.z, undefined, true)
        : 0;
      swimming = swimmingState({
        swimming,
        inLake: wet,
        depth: LAKE_LEVEL - ground,
        bodyY: position.y,
        indoors: false,
        occupied: false,
      });
      if (!swimming) {
        reachedShallows = true;
        break;
      }
      body.setLinvel(
        swimVelocity({
          velocity: body.linvel(),
          direction: { x: 0, z: 1 },
          bodyY: position.y,
          groundY: ground,
          time: i / 60,
          dt: 1 / 60,
        }),
        true,
      );
      world.step();
    }
    expect(reachedShallows).toBe(true);
    world.free();
    patches.forEach((g) => g.dispose());
  }, 15_000);
});
