import { beforeAll, expect, it } from "vitest";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { collisionMesh, surfaceGrip } from "./static-collision";
const { loadRig } = await import(/* @vite-ignore */ new URL("../../../scripts/extract-activity-clips.mjs", import.meta.url).href);
beforeAll(async () => { await RAPIER.init(); });

it("matches the visible roofs of all six cabins instead of an invisible flat box", async () => {
  for (const id of ["Gable", "AFrame", "Sage", "GableBlue", "AFrameCopper", "SagePergola"]) {
    const { scene } = await loadRig(new URL(`../public/assets/optimized/Lake_Cabin_${id}.glb`, import.meta.url).pathname);
    const shape = collisionMesh(scene);
    expect(collisionMesh(scene)).toBe(shape);
    const world = new RAPIER.World({x:0,y:-12,z:0});
    world.createCollider(RAPIER.ColliderDesc.trimesh(shape.vertices, shape.indices).setFriction(surfaceGrip));
    world.step(); scene.updateMatrixWorld(true);
    let roofs = 0;
    for (const x of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
      const visible = new THREE.Raycaster(new THREE.Vector3(x, 20, z), new THREE.Vector3(0,-1,0)).intersectObject(scene, true)[0];
      const solid = world.castRay(new RAPIER.Ray({x,y:20,z},{x:0,y:-1,z:0}),30,true);
      if (!visible) continue;
      expect(solid, id).not.toBeNull();
      expect(20-solid!.timeOfImpact, id).toBeCloseTo(visible.point.y, 3);
      if (visible.point.y > 3) roofs++;
    }
    expect(roofs, id).toBeGreaterThan(0);
    world.free();
  }
});

it("supports a capsule landing on a table without continued drifting", async () => {
  const { scene } = await loadRig(new URL("../public/assets/optimized/Table_Large.glb", import.meta.url).pathname);
  const shape = collisionMesh(scene), box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3()), scale = .85 / (box.max.y-box.min.y);
  const vertices = shape.vertices.slice();
  for (let i=0;i<vertices.length;i+=3) { vertices[i]=(vertices[i]-center.x)*scale; vertices[i+1]=(vertices[i+1]-box.min.y)*scale; vertices[i+2]=(vertices[i+2]-center.z)*scale; }
  const world = new RAPIER.World({x:0,y:-12,z:0});
  world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, shape.indices).setFriction(surfaceGrip));
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,2.3,0).lockRotations().setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.capsule(.35,.3).setFriction(1.2).setRestitution(0),body);
  for (let i=0;i<180;i++) world.step();
  expect(body.translation().y).toBeCloseTo(.85+.65,1);
  const before = {...body.translation()};
  for (let i=0;i<180;i++) world.step();
  expect(Math.hypot(body.translation().x-before.x,body.translation().z-before.z)).toBeLessThan(.05);
  world.free();
});

it("retains child transforms without baking a parent's world placement twice", () => {
  const root = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(2,1,2));
  mesh.position.y=2; root.add(mesh); root.position.set(100,10,-30); root.rotation.y=.7;
  const shape=collisionMesh(root);
  const y=[];for(let i=1;i<shape.vertices.length;i+=3)y.push(shape.vertices[i]);
  expect(Math.min(...y)).toBeCloseTo(1.5);expect(Math.max(...y)).toBeCloseTo(2.5);
  expect(Math.max(...shape.vertices)).toBeLessThan(3);
});
