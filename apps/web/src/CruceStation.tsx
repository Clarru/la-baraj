import { Text, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { Model } from "./assets";
import { Bench } from "./Bench";
import {
  CRUCE_TABLE,
  CRUCE_SEATS,
} from "../../../packages/shared/cruce-station";

/** Reuses the lakeside timber table and benches; the deck has its own authored art. */
export function CruceStation({ flat }: { flat: boolean }) {
  const cards = useTexture([
    "/assets/cruce/heart-ace.webp",
    "/assets/cruce/leaf-king.webp",
    "/assets/cruce/acorn-ten.webp",
  ]);
  const felt = useTexture("/assets/cruce/felt.webp");
  felt.colorSpace = THREE.SRGBColorSpace;
  cards.forEach((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
  });
  return (
    <group
      name="Cruce card table"
      position={[CRUCE_TABLE.x, CRUCE_TABLE.ground, CRUCE_TABLE.z]}
    >
      <Model id="Table_Large" height={0.85} flat={flat} />
      {CRUCE_SEATS.map((id, i) => {
        const angle = (i * Math.PI) / 2;
        return (
          <Bench
            key={id}
            benchId={id.split(":")[0]}
            height={0.52}
            position={[-Math.sin(angle) * 1.22, 0, Math.cos(angle) * 1.22]}
            rotation={Math.PI - angle}
            facing={0}
            scale={[0.48, 1, 1]}
            flat={flat}
            bench={{ capacity: 1, label: "Masa de Cruce", facingOffset: 0 }}
          />
        );
      })}
      <mesh
        position={[0, 0.858, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[1.18, 1.18]} />
        <meshStandardMaterial map={felt} roughness={1} />
      </mesh>
      {cards.map((map, i) => (
        <group
          key={i}
          position={[(i - 1) * 0.16, 0.863 + i * 0.001, -0.05 + i * 0.035]}
          rotation={[0, (i - 1) * 0.25, 0]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.14, 0.226]} />
            <meshStandardMaterial
              map={map}
              roughness={0.85}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
      <mesh position={[0.35, 0.89, 0.32]} rotation={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.15, 0.06, 0.23]} />
        <meshStandardMaterial color="#823e35" roughness={0.9} />
      </mesh>
      <group position={[0, 1.02, -1.5]}>
        <mesh castShadow>
          <boxGeometry args={[0.66, 0.28, 0.045]} />
          <meshStandardMaterial color="#6f5436" roughness={0.95} />
        </mesh>
        <Text
          geometry-instanceCount={0}
          position={[0, 0, 0.026]}
          font="/fonts/AlegreyaSans-Bold.ttf"
          fontSize={0.14}
          color="#f3e5c9"
          anchorX="center"
          anchorY="middle"
        >
          Cruce
          <meshBasicMaterial side={THREE.DoubleSide} transparent />
        </Text>
      </group>
    </group>
  );
}
