import * as THREE from "three";
import type { RigidBody, World } from "@dimforge/rapier3d-compat";

export type CollisionMesh = { vertices: Float32Array; indices: Uint32Array };
const cache = new WeakMap<THREE.Object3D, CollisionMesh>();
/** One shared fixed triangle mesh per prefab, preserving roof slopes and furniture gaps. */
export function collisionMesh(source: THREE.Object3D): CollisionMesh {
  const saved = cache.get(source);
  if (saved) return saved;
  source.updateWorldMatrix(true, true);
  const inverse = source.matrixWorld.clone().invert();
  const vertices: number[] = [], indices: number[] = [];
  const point = new THREE.Vector3();
  source.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || node instanceof THREE.SkinnedMesh || !node.visible) return;
    const geometry = node.geometry as THREE.BufferGeometry;
    const positions = geometry.getAttribute("position");
    if (!positions) return;
    const matrix = inverse.clone().multiply(node.matrixWorld);
    const offset = vertices.length / 3;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
      vertices.push(point.x, point.y, point.z);
    }
    const count = geometry.index?.count ?? positions.count;
    for (let i = 0; i < count; i++) indices.push(offset + (geometry.index?.getX(i) ?? i));
  });
  const result = { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
  cache.set(source, result);
  return result;
}

export const surfaceGrip = 1.4;

/** The Physics provider may free its world before a child's effect cleanup. */
export function releaseSolidBody(world: World, body: RigidBody | null) {
  if (!body) return;
  try {
    if (!body.isValid()) return;
  } catch {
    // Checking a freed body's validity throws. Do not wake the lazy world proxy.
    return;
  }
  world.removeRigidBody(body);
}
