import { useRef } from "react";
import { Text, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import * as T from "three";
import { useModelBench } from "./BenchRegistration";
import { currentMultiplayerRoom } from "./multiplayer";
import { cruceFaceTexture } from "./cruce-character";
import {
  CRUCE_TABLE as TABLE,
  CRUCE_SEATS,
  crucePlayTarget,
} from "../../../packages/shared/cruce-station";
import type { CruceSeat } from "../../../packages/shared/cruce";
export function CruceBench({ seat }: { seat: CruceSeat }) {
  const root = useRef<T.Group>(null),
    angle = (seat * Math.PI) / 2;
  useModelBench(
    root,
    "CruceBench",
    {
      width: TABLE.benchWidth,
      depth: TABLE.benchDepth,
      height: TABLE.seatHeight,
    },
    {
      id: CRUCE_SEATS[seat].split(":")[0],
      label: "Masa de Cruce",
      capacity: 1,
      endMargin: 0.12,
      facingOffset: 0,
      seatSurfaceHeight: TABLE.seatHeight,
    },
  );
  return (
    <group
      ref={root}
      position={[
        -Math.sin(angle) * TABLE.benchRadius,
        0,
        Math.cos(angle) * TABLE.benchRadius,
      ]}
      rotation={[0, Math.PI - angle, 0]}
    >
      <RigidBody type="fixed" colliders={false}>
        <mesh
          position={[0, TABLE.seatHeight - 0.035, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[TABLE.benchWidth, 0.07, TABLE.benchDepth]} />
          <meshStandardMaterial color="#895a34" roughness={0.9} />
        </mesh>
        <CuboidCollider
          args={[TABLE.benchWidth / 2, 0.035, TABLE.benchDepth / 2]}
          position={[0, TABLE.seatHeight - 0.035, 0]}
        />
        {[-0.4, 0.4].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.2, 0]} castShadow>
              <boxGeometry args={[0.1, 0.4, 0.3]} />
              <meshStandardMaterial color="#67482e" roughness={1} />
            </mesh>
            <CuboidCollider args={[0.05, 0.2, 0.15]} position={[x, 0.2, 0]} />
          </group>
        ))}
      </RigidBody>
    </group>
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
export function CruceStation({ flat: _flat }: { flat: boolean }) {
  const felt = useTexture("/assets/cruce/felt.webp");
  felt.colorSpace = T.SRGBColorSpace;
  return (
    <group
      name="Cruce square card table"
      position={[TABLE.x, TABLE.ground, TABLE.z]}
    >
      <RigidBody type="fixed" colliders={false}>
        <mesh position={[0, TABLE.surface - 0.04, 0]} castShadow receiveShadow>
          <boxGeometry
            args={[TABLE.halfWidth * 2, 0.08, TABLE.halfWidth * 2]}
          />
          <meshStandardMaterial color="#795033" roughness={0.9} />
        </mesh>
        <CuboidCollider
          args={[TABLE.halfWidth, 0.04, TABLE.halfWidth]}
          position={[0, TABLE.surface - 0.04, 0]}
        />
        {[-0.76, 0.76].flatMap((x) =>
          [-0.76, 0.76].map((z) => (
            <group key={`${x}:${z}`}>
              <mesh position={[x, 0.37, z]} castShadow>
                <boxGeometry args={[0.12, 0.74, 0.12]} />
                <meshStandardMaterial color="#62452e" roughness={1} />
              </mesh>
              <CuboidCollider
                args={[0.06, 0.37, 0.06]}
                position={[x, 0.37, z]}
              />
            </group>
          )),
        )}
      </RigidBody>
      <mesh
        position={[0, TABLE.surface + 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[1.64, 1.64]} />
        <meshStandardMaterial map={felt} roughness={1} />
      </mesh>
      {([0, 1, 2, 3] as CruceSeat[]).map((seat) => (
        <CruceBench key={seat} seat={seat} />
      ))}
      <PublicTrick />
      <mesh position={[0.5, TABLE.surface + 0.025, 0.42]} castShadow>
        <boxGeometry args={[0.085, 0.045, 0.137]} />
        <meshStandardMaterial color="#823e35" roughness={0.9} />
      </mesh>
      <group position={[0.9, 1.02, -2.03]}>
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
          <meshBasicMaterial side={T.DoubleSide} transparent />
        </Text>
      </group>
    </group>
  );
}
