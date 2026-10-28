import { useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useModelBench, type BenchOptions } from "./BenchRegistration";
import { StaticCollider } from "./StaticCollider";
export const assetUrl = (id: string) => `/assets/optimized/${id}.glb`;
function materialFor(source: THREE.Material, flat: boolean) {
  const m = source.clone() as THREE.MeshStandardMaterial;
  m.roughness = Math.max(m.roughness ?? 0.8, 0.65);
  m.metalness = Math.min(m.metalness ?? 0, 0.15);
  if (m.map) m.map.anisotropy = 4;
  if (flat) {
    m.map = null;
    m.normalMap = null;
    m.roughnessMap = null;
    m.metalnessMap = null;
    const name = m.name.toLowerCase();
    m.color.set(
      name.includes("leave") || name.includes("grass") || name.includes("plant")
        ? "#769656"
        : name.includes("rock") || name.includes("stone")
          ? "#8d9482"
          : name.includes("roof") || name.includes("tile")
            ? "#a5573a"
            : "#977754",
    );
  }
  return m;
}
export function Model({
  id,
  height = 1,
  position = [0, 0, 0],
  rotation = 0,
  flat = false,
  scale = [1, 1, 1],
  bench,
}: {
  id: string;
  height?: number;
  position?: [number, number, number];
  rotation?: number;
  flat?: boolean;
  scale?: [number, number, number];
  bench?: BenchOptions;
}) {
  const { scene } = useGLTF(assetUrl(id));
  const model = useMemo(() => {
    const obj = scene.clone(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = height / size.y;
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => materialFor(m, flat))
          : materialFor(o.material, flat);
      }
    });
    return {
      obj,
      s,
      dimensions: {width:size.x*s,depth:size.z*s,height},
      offset: [-center.x, -box.min.y, -center.z] as [number, number, number],
    };
  }, [scene, height, flat]);
  const root = useRef<THREE.Group>(null);
  useModelBench(root,id,model.dimensions,bench);
  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]} scale={scale}>
      <group scale={model.s}>
        <primitive object={model.obj} position={model.offset} dispose={null} />
        <group position={model.offset}><StaticCollider object={scene} /></group>
      </group>
    </group>
  );
}
export type Placement = {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
};
export function ModelInstances({
  id,
  placements,
  flat = false,
  shadows = true,
}: {
  id: string;
  placements: Placement[];
  flat?: boolean;
  shadows?: boolean;
}) {
  const { scene } = useGLTF(assetUrl(id));
  const templates = useMemo(() => {
    scene.updateMatrixWorld(true);
    const results: {
      geometry: THREE.BufferGeometry;
      material: THREE.Material | THREE.Material[];
      matrix: THREE.Matrix4;
    }[] = [];
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const normalize = new THREE.Matrix4().makeTranslation(
      -center.x,
      -box.min.y,
      -center.z,
    );
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        results.push({
          geometry: o.geometry,
          material: Array.isArray(o.material)
            ? o.material.map((m) => materialFor(m, flat))
            : materialFor(o.material, flat),
          matrix: normalize.clone().multiply(o.matrixWorld),
        });
      }
    });
    return results;
  }, [scene, flat]);
  return (
    <>
      {templates.map((t, i) => (
        <InstanceBatch
          key={i}
          template={t}
          placements={placements}
          shadows={shadows}
        />
      ))}
    </>
  );
}
function InstanceBatch({
  template,
  placements,
  shadows,
}: {
  template: {
    geometry: THREE.BufferGeometry;
    material: THREE.Material | THREE.Material[];
    matrix: THREE.Matrix4;
  };
  placements: Placement[];
  shadows: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const p = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3(),
      matrix = new THREE.Matrix4();
    placements.forEach((v, i) => {
      p.set(v.x, v.y, v.z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, v.rotation);
      s.setScalar(v.scale);
      matrix.compose(p, q, s).multiply(template.matrix);
      mesh.current!.setMatrixAt(i, matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [placements, template]);
  return (
    <instancedMesh
      ref={mesh}
      args={[template.geometry, template.material, placements.length]}
      castShadow={shadows}
      receiveShadow
      dispose={null}
    />
  );
}
