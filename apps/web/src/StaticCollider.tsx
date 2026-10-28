import { useMemo } from "react";
import { RigidBody, TrimeshCollider } from "@react-three/rapier";
import type { Object3D } from "three";
import { collisionMesh, surfaceGrip } from "./static-collision";

/** Fixed solids only: characters, flames and other transient effects never use this. */
export function StaticCollider({ object }: { object: Object3D }) {
  const mesh = useMemo(() => collisionMesh(object), [object]);
  if (!mesh.indices.length) return null;
  return <RigidBody type="fixed" colliders={false}>
    <TrimeshCollider args={[mesh.vertices, mesh.indices]} friction={surfaceGrip} restitution={0} />
  </RigidBody>;
}
