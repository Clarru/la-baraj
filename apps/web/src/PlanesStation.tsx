import { useEffect, useMemo } from "react";
import { Text, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { Model } from "./assets";
import { Bench } from "./Bench";
import { PLANES_TABLE } from "../../../packages/shared/planes-station";

/** Reference: docs/art-direction/planes/table-reference.png. Reuse our timber furniture. */
export function PlanesStation({ flat }: { flat: boolean }) {
  const paper = useTexture("/assets/planes/notebook-paper.webp");
  paper.colorSpace = THREE.SRGBColorSpace;
  const lines = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const p = -0.3 + i * 0.06;
      points.push(p, 0, -0.3, p, 0, 0.3, -0.3, 0, p, 0.3, 0, p);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3),
    );
    return geometry;
  }, []);
  useEffect(() => () => lines.dispose(), [lines]);
  return (
    <group
      name="Planes game table"
      position={[PLANES_TABLE.x, PLANES_TABLE.ground, PLANES_TABLE.z]}
      rotation={[0, Math.PI / 2, 0]}
    >
      <Model id="Table_Large" height={0.85} flat={flat} />
      <Bench
        benchId="planes-north"
        height={0.52}
        position={[0, 0, -1]}
        rotation={0}
        facing={0}
        flat={flat}
        bench={{ capacity: 1, label: "Planes table", facingOffset: 0 }}
      />
      <Bench
        benchId="planes-south"
        height={0.52}
        position={[0, 0, 1.05]}
        rotation={Math.PI}
        facing={0}
        flat={flat}
        bench={{ capacity: 1, label: "Planes table", facingOffset: 0 }}
      />
      {[-0.43, 0.43].map((z, i) => (
        <group key={i} position={[0, 0.856, z]} rotation={[0, i * Math.PI, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[0.72, 0.76]} />
            <meshStandardMaterial
              map={paper}
              roughness={1}
              side={THREE.DoubleSide}
            />
          </mesh>
          <lineSegments geometry={lines} position={[0, 0.002, 0]}>
            <lineBasicMaterial color="#8da9bf" transparent opacity={0.75} />
          </lineSegments>
          <group position={[0, 0.013, 0.43]} rotation={[0, 0, Math.PI / 2]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.009, 0.009, 0.39, 6]} />
              <meshStandardMaterial
                color={i ? "#9c473b" : "#315378"}
                roughness={0.8}
              />
            </mesh>
            <mesh position={[0, 0.21, 0]}>
              <coneGeometry args={[0.009, 0.03, 6]} />
              <meshStandardMaterial color="#433f37" />
            </mesh>
          </group>
        </group>
      ))}
      <group position={[1.2, 1.02, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.58, 0.26, 0.035]} />
          <meshStandardMaterial color="#6f5436" roughness={0.95} />
        </mesh>
        <Text
          geometry-instanceCount={0}
          position={[0, 0, 0.02]}
          font="/fonts/AlegreyaSans-Bold.ttf"
          fontSize={0.13}
          color="#f3e5c9"
          anchorX="center"
          anchorY="middle"
        >
          Planes
          <meshBasicMaterial side={THREE.DoubleSide} transparent />
        </Text>
      </group>
    </group>
  );
}
