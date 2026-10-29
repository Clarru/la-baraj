import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { LAKE_LEVEL } from "./swim-motion";

// Shared immutable geometry: one small translucent draw per nearby swimmer.
const ring = new THREE.RingGeometry(0.58, 0.64, 32);
const material = new THREE.MeshBasicMaterial({
  color: "#d5eee5",
  transparent: true,
  opacity: 0.18,
  depthWrite: false,
  side: THREE.DoubleSide,
});
/** `scale` widens the ring, e.g. for a boat hull. */
export function SwimWake({ scale: size = 1 }: { scale?: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const world = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    if (!mesh.current?.parent) return;
    mesh.current.parent.getWorldPosition(world);
    mesh.current.position.y = LAKE_LEVEL + 0.025 - world.y;
    const scale = size * (1 + 0.18 * Math.sin(clock.elapsedTime * 2.1));
    mesh.current.scale.set(scale, scale * 0.72, 1);
  });
  return (
    <mesh
      ref={mesh}
      geometry={ring}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
      dispose={null}
    />
  );
}
