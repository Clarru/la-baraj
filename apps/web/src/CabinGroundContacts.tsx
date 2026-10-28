import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import * as THREE from "three";
import { cabinSpots, terrainHeight } from "./geography";
import { cabinDesignForPlot, cabinYaw } from "./cabin-designs";
import {
  planLevelFoundation,
  sampleFootprintGround,
  type FoundationSupport,
} from "./cabin-grounding";

/** Ground contact only: cabin models, level transforms and fixed bodies stay owned by the house scene. */
export type GroundContactsSummary = {
  cabins: number;
  skirtTriangles: number;
  porchSupports: number;
  maxPlinthGap: number;
};
export function CabinGroundContacts({
  onReady,
}: {
  onReady?: (summary: GroundContactsSummary) => void;
}) {
  const { world, rapier } = useRapier();
  const ready = useRef(false),
    elapsed = useRef(0),
    posts = useRef<THREE.InstancedMesh>(null);
  const [contacts, setContacts] = useState<{
    vertices: number[];
    supports: FoundationSupport[];
  } | null>(null);
  useFrame((_, dt) => {
    if (ready.current) return;
    elapsed.current += dt;
    if (elapsed.current < 0.12) return;
    const sampleGround = (x: number, z: number) => {
      const hit = world.castRay(
        new rapier.Ray({ x, y: 1000, z }, { x: 0, y: -1, z: 0 }),
        2000,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (collider) =>
          (collider.parent()?.userData as { terrain?: boolean } | undefined)
            ?.terrain === true,
      );
      return hit ? 1000 - hit.timeOfImpact : NaN;
    };
    // Wait for the fixed terrain collider's first physics step.
    if (!Number.isFinite(sampleGround(cabinSpots[0].x, cabinSpots[0].z)))
      return;
    ready.current = true;
    const vertices: number[] = [],
      supports: FoundationSupport[] = [];
    let cabins = 0,
      maxPlinthGap = 0;
    for (const cabin of cabinSpots) {
      const design = cabinDesignForPlot(cabin.i),
        width = design.width,
        depth = design.depth;
      const pose = {
        x: cabin.x,
        z: cabin.z,
        yaw: cabinYaw(cabin.i),
      };
      const base = terrainHeight(cabin.x, cabin.z),
        top = base + 0.1;
      const footprint = {
        minX: -width / 2,
        maxX: width / 2,
        minZ: -depth / 2,
        maxZ: depth / 2,
      };
      const corners = sampleFootprintGround(footprint, pose, sampleGround);
      if (corners.some((p) => !Number.isFinite(p.groundY))) continue;
      cabins++;
      maxPlinthGap = Math.max(
        maxPlinthGap,
        ...corners.map((p) => Math.max(0, base - p.groundY)),
      );
      // Extend the existing stone plinth to the actual terrain triangles. Tops remain level.
      const ring = [0, 3, 6, 7, 8, 5, 2, 1, 0];
      for (let i = 1; i < ring.length; i++) {
        const a = corners[ring[i - 1]],
          b = corners[ring[i]];
        if (Math.max(top - a.groundY, top - b.groundY) < 0.03) continue;
        const ay = Math.min(top, a.groundY - 0.1),
          by = Math.min(top, b.groundY - 0.1);
        vertices.push(
          a.x,
          top,
          a.z,
          a.x,
          ay,
          a.z,
          b.x,
          by,
          b.z,
          a.x,
          top,
          a.z,
          b.x,
          by,
          b.z,
          b.x,
          top,
          b.z,
        );
      }
      for (const footprint of design.porches) {
        const porch = sampleFootprintGround(
          footprint,
          pose,
          sampleGround,
        ).filter((_, i) => [0, 2, 6, 8].includes(i));
        const highest = Math.max(...porch.map((p) => p.groundY));
        const plan = planLevelFoundation(porch, {
          clearance: Math.max(0, base + 0.515 - highest),
          embedment: 0.12,
          maxRise: 2,
          maxSpan: 10,
          maxSupportHeight: 2,
        });
        if (plan.ok)
          supports.push(
            ...plan.supports.filter((s) => s.topY - s.groundY > 0.04),
          );
      }
    }
    setContacts({ vertices, supports });
    onReady?.({
      cabins,
      skirtTriangles: vertices.length / 9,
      porchSupports: supports.length,
      maxPlinthGap,
    });
  });
  const geometry = useMemo(() => {
    if (!contacts?.vertices.length) return null;
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(contacts.vertices, 3),
    );
    result.computeVertexNormals();
    return result;
  }, [contacts]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useLayoutEffect(() => {
    if (!posts.current || !contacts) return;
    const dummy = new THREE.Object3D();
    contacts.supports.forEach((support, i) => {
      dummy.position.set(support.x, support.centerY, support.z);
      dummy.scale.set(0.28, support.length, 0.28);
      dummy.updateMatrix();
      posts.current!.setMatrixAt(i, dummy.matrix);
    });
    posts.current.instanceMatrix.needsUpdate = true;
    posts.current.computeBoundingSphere();
  }, [contacts]);
  return (
    <group name="level-cabin-ground-contacts">
      {geometry && (
        <mesh geometry={geometry} receiveShadow>
          <meshStandardMaterial
            color="#747468"
            roughness={1}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {!!contacts?.supports.length && (
        <instancedMesh
          ref={posts}
          args={[undefined, undefined, contacts.supports.length]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#6a6559" roughness={1} />
        </instancedMesh>
      )}
    </group>
  );
}
