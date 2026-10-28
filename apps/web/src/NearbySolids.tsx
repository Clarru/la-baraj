import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useRapier } from "@react-three/rapier";
import type { Collider, RigidBody as PhysicsBody } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { playerPosition } from "./player";
import { assetUrl, type Placement } from "./assets";
import { collisionMesh, surfaceGrip } from "./static-collision";

export type NaturalSolid = Placement & { id: string; key: string; treeHeight?: number };
/** Physics stays independent from visual LOD; a small active radius bounds collider cost. */
export function NearbySolids({ items }: { items: NaturalSolid[] }) {
  const { world, rapier } = useRapier();
  const models = useGLTF([assetUrl("Rock_Medium_1"), assetUrl("Rock_Medium_2"), assetUrl("Bush_Common")]);
  const shapes = useMemo(() => Object.fromEntries(models.map((m, i) => {
    const raw = collisionMesh(m.scene);
    const box = new THREE.Box3().setFromObject(m.scene), center = box.getCenter(new THREE.Vector3());
    const vertices = raw.vertices.slice();
    for (let j = 0; j < vertices.length; j += 3) {
      vertices[j] -= center.x; vertices[j + 1] -= box.min.y; vertices[j + 2] -= center.z;
    }
    return [["Rock_Medium_1", "Rock_Medium_2", "Bush_Common"][i], { vertices, indices: raw.indices }];
  })), [models]);
  const active = useRef(new Map<string, Collider>());
  const body = useRef<PhysicsBody | null>(null);
  const clock = useRef(1);
  const point = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    body.current = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    return () => {
      if (body.current?.isValid()) world.removeRigidBody(body.current);
      body.current = null;
      active.current.clear();
    };
  }, [world, rapier]);
  useFrame((_, dt) => {
    if (!body.current) return;
    clock.current += dt;
    if (clock.current < .25) return;
    clock.current = 0;
    for (const item of items) {
      const distance = Math.hypot(item.x - playerPosition.x, item.z - playerPosition.z);
      const existing = active.current.get(item.key);
      if (distance > 100) {
        if (existing) { world.removeCollider(existing, false); active.current.delete(item.key); }
        continue;
      }
      if (existing || distance > 85) continue;
      let desc;
      if (item.treeHeight) {
        const height = item.treeHeight * item.scale;
        desc = rapier.ColliderDesc.cylinder(height / 2, .24 * item.scale).setTranslation(item.x, item.y + height / 2, item.z);
      } else {
        const shape = shapes[item.id];
        const vertices = new Float32Array(shape.vertices.length);
        for (let i = 0; i < vertices.length; i += 3) {
          point.set(shape.vertices[i], shape.vertices[i + 1], shape.vertices[i + 2]).multiplyScalar(item.scale).applyAxisAngle(THREE.Object3D.DEFAULT_UP, item.rotation);
          vertices.set([point.x + item.x, point.y + item.y, point.z + item.z], i);
        }
        desc = rapier.ColliderDesc.trimesh(vertices, shape.indices);
      }
      desc.setFriction(surfaceGrip).setRestitution(0);
      active.current.set(item.key, world.createCollider(desc, body.current));
    }
  });
  return null;
}
