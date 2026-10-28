import { useMemo } from "react";
import { useGLTF, Html } from "@react-three/drei";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import * as THREE from "three";
import { cabinSpots, terrainHeight } from "./geography";
import { cabinDesignForPlot, cabinYaw } from "./cabin-designs";
import {
  roomNames,
  roomSizes,
  interiorFloorOffset,
  cabinDoor,
} from "./cabin-interior-state";
import { roomCutawayFront } from "./cabin-cutaway";
import { assetUrl } from "./assets";
import { StaticCollider } from "./StaticCollider";
export function CabinInterior({ index }: { index: number }) {
  const cabin = cabinSpots[index],
    design = cabinDesignForPlot(index),
    size = roomSizes[design.family];
  const { scene } = useGLTF(
    assetUrl("Lake_Interior_" + roomNames[design.family]),
  );
  const object = useMemo(() => {
    const clone = roomCutawayFront(scene, size.depth / 2);
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return clone;
  }, [scene, size.depth]);
  const door = cabinDoor(index);
  return (
    <group
      position={[
        cabin.x,
        terrainHeight(cabin.x, cabin.z) + interiorFloorOffset,
        cabin.z,
      ]}
      rotation={[0, cabinYaw(index), 0]}
      name={`cabin-${index + 1}-interior`}
    >
      <group position={[0, 0, door.roomOffsetZ]}>
        <primitive object={object} dispose={null} />
        <StaticCollider object={object} />
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider
            args={[size.width / 2, 0.1, size.depth / 2]}
            position={[0, -0.1, 0]}
          />
          {/* Cutaway walls remain solid for movement even where the camera opens the view. */}
          <CuboidCollider
            args={[0.1, 1.7, size.depth / 2]}
            position={[size.width / 2 + 0.05, 1.7, 0]}
          />
          <CuboidCollider
            args={[0.1, 1.7, size.depth / 2]}
            position={[-size.width / 2 - 0.05, 1.7, 0]}
          />
          <CuboidCollider
            args={[size.width / 2, 1.7, 0.1]}
            position={[0, 1.7, size.depth / 2 + 0.05]}
          />
          <CuboidCollider
            args={[size.width / 2, 1.7, 0.1]}
            position={[0, 1.7, -size.depth / 2 - 0.05]}
          />

        </RigidBody>
      </group>
      <ambientLight intensity={0.34} />
      <pointLight
        position={[-1.8, 1.8, -1.8]}
        color="#ffd29a"
        intensity={5}
        distance={7}
        decay={2}
      />
      <pointLight
        position={[1.8, 2.3, 0.5]}
        color="#ffe6c2"
        intensity={3}
        distance={7}
        decay={2}
      />
      <Html
        center
        position={[door.x, 0.12, door.insideZ - 0.35]}
        zIndexRange={[20, 0]}
      >
        <span className="interior-exit-label">Door · E to leave</span>
      </Html>
    </group>
  );
}
for (const name of roomNames)
  useGLTF.preload(assetUrl("Lake_Interior_" + name));
