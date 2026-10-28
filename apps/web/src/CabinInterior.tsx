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
import { assetUrl } from "./assets";
export function CabinInterior({ index }: { index: number }) {
  const cabin = cabinSpots[index],
    design = cabinDesignForPlot(index),
    size = roomSizes[design.family];
  const { scene } = useGLTF(
    assetUrl("Lake_Interior_" + roomNames[design.family]),
  );
  const object = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);
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
        <RigidBody type="fixed" colliders={false}>
          <primitive object={object} dispose={null} />
        </RigidBody>
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
          <CuboidCollider
            args={[size.width / 2, 0.1, size.depth / 2]}
            position={[0, 5.1, 0]}
          />
        </RigidBody>
        {/* Tall navigation volumes prevent the controller stepping onto low furniture. */}
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider
            args={[0.51, 1.5, 1.03]}
            position={[-size.width / 2 + 0.66, 1.5, 0.65]}
          />
          <CuboidCollider
            args={[0.48, 1.5, 0.56]}
            position={[-0.5, 1.5, 0.4]}
          />
          <CuboidCollider
            args={[0.85, 1.5, 1.04]}
            position={[
              design.family === 0 ? -1.35 : 0,
              1.5,
              design.family === 0 ? -1.55 : design.family === 1 ? -1.42 : -1.6,
            ]}
          />
          {design.family === 1 ? (
            <CuboidCollider
              args={[0.72, 1.5, 0.58]}
              position={[1.85, 1.5, 0.35]}
            />
          ) : (
            <CuboidCollider
              args={[0.85, 1.5, 0.4]}
              position={[
                design.family === 0 ? 1.43 : 2,
                1.5,
                design.family === 0 ? -2.22 : -2.05,
              ]}
            />
          )}
          {design.family === 2 && (
            <CuboidCollider
              args={[0.12, 1.5, 1.05]}
              position={[1, 1.5, -1.6]}
            />
          )}
          {design.family === 2 && (
            <CuboidCollider
              args={[0.94, 1.5, 0.25]}
              position={[1.95, 1.5, -0.1]}
            />
          )}
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
