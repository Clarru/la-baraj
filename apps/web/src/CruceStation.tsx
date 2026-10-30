import { useRef } from "react";
import { Text, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import * as T from "three";
import { Model } from "./assets";
import { currentMultiplayerRoom } from "./multiplayer";
import { cruceFaceTexture } from "./cruce-character";
import {
  CRUCE_TABLE as TABLE,
  CRUCE_SEATS,
  crucePlayTarget,
} from "../../../packages/shared/cruce-station";
import type { CruceSeat } from "../../../packages/shared/cruce";
export function CruceBench({
  seat,
  flat = false,
}: {
  seat: CruceSeat;
  flat?: boolean;
}) {
  const angle = (seat * Math.PI) / 2;
  return (
    <Model
      id="Cruce_Bench_Wood"
      height={TABLE.seatHeight}
      flat={flat}
      position={[
        -Math.sin(angle) * TABLE.benchRadius,
        0,
        Math.cos(angle) * TABLE.benchRadius,
      ]}
      rotation={Math.PI - angle}
      bench={{
        id: CRUCE_SEATS[seat].split(":")[0],
        label: "Masa de Cruce",
        capacity: 1,
        endMargin: 0.12,
        facingOffset: 0,
        seatSurfaceHeight: TABLE.seatHeight,
      }}
    />
  );
}
function PublicTrick() {
  const meshes = useRef<(T.Mesh | null)[]>([]),
    seen = useRef(new Map<string, number>());
  useFrame(() => {
    const v = currentMultiplayerRoom()?.getSnapshot().cruce,
      now = performance.now();
    meshes.current.forEach((mesh, seat) => {
      if (!mesh) return;
      const played = v?.trick.find((p) => p.seat === seat);
      mesh.visible = false;
      if (!played || !v) return;
      const key = `${v.round}:${played.card}`;
      if (!seen.current.has(key)) seen.current.set(key, now);
      if (now - seen.current.get(key)! < 750) return;
      mesh.visible = true;
      const m = mesh.material as T.MeshStandardMaterial;
      const texture = cruceFaceTexture(played.card);
      if (m.map !== texture) {
        m.map = texture;
        m.needsUpdate = true;
      }
    });
  });
  return (
    <>
      {([0, 1, 2, 3] as CruceSeat[]).map((seat) => {
        const p = crucePlayTarget(seat);
        return (
          <mesh
            key={seat}
            ref={(m) => {
              meshes.current[seat] = m;
            }}
            name={`Cruce public trick card ${seat}`}
            position={[p[0] - TABLE.x, p[1] - TABLE.ground, p[2] - TABLE.z]}
            rotation={[-Math.PI / 2, 0, seat * 0.1]}
            visible={false}
          >
            <planeGeometry args={[0.085, 0.137]} />
            <meshStandardMaterial
              color="#fffdf4"
              side={T.DoubleSide}
              roughness={0.8}
            />
          </mesh>
        );
      })}
    </>
  );
}
/** Square table with separate benches. No picnic model containing hidden/integrated seating. */
export function CruceStation({ flat }: { flat: boolean }) {
  const felt = useTexture("/assets/cruce/felt.webp");
  felt.colorSpace = T.SRGBColorSpace;
  const wood = useTexture("/assets/cruce/wood-grain-v2.webp");
  wood.colorSpace = T.SRGBColorSpace;
  return (
    <group
      name="Cruce square card table"
      position={[TABLE.x, TABLE.ground, TABLE.z]}
    >
      <Model id="Cruce_Table_Wood" height={TABLE.surface} flat={flat} />
      <mesh
        position={[0, TABLE.surface + 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[1.28, 1.28]} />
        <meshStandardMaterial map={felt} roughness={1} />
      </mesh>
      {([0, 1, 2, 3] as CruceSeat[]).map((seat) => (
        <CruceBench key={seat} seat={seat} flat={flat} />
      ))}
      <PublicTrick />
      <mesh position={[0.5, TABLE.surface + 0.025, 0.42]} castShadow>
        <boxGeometry args={[0.085, 0.045, 0.137]} />
        <meshStandardMaterial color="#823e35" roughness={0.9} />
      </mesh>
      <group
        name="Cruce freestanding sign"
        position={[1.13, 0, -1.13]}
        rotation={[0, 0.2, 0]}
      >
        <RigidBody type="fixed" colliders={false}>
          <mesh position={[0, 0.68, -0.035]} castShadow receiveShadow>
            <boxGeometry args={[0.095, 1.36, 0.095]} />
            <meshStandardMaterial map={wood} color="#c5b49f" roughness={0.9} />
          </mesh>
          <CuboidCollider
            args={[0.0475, 0.68, 0.0475]}
            position={[0, 0.68, -0.035]}
          />
        </RigidBody>
        <group position={[0, 1.28, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.66, 0.28, 0.045]} />
            <meshStandardMaterial map={wood} color="#7c6852" roughness={0.9} />
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
            <meshBasicMaterial side={T.DoubleSide} transparent />
          </Text>
        </group>
      </group>
    </group>
  );
}
