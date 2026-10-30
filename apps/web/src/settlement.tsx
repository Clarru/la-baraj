import { Suspense, useEffect, useMemo } from "react";
import { Text, useGLTF, useTexture } from "@react-three/drei";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import * as THREE from "three";
import { Model, assetUrl } from "./assets";
import { StaticCollider } from "./StaticCollider";
import { Bench, CabinBenchSeats } from "./Bench";
import { CampfireLogs } from "./campfire";
import { CruceStation } from "./CruceStation";
import { PlanesStation } from "./PlanesStation";
import { cabinCutawayBase } from "./cabin-cutaway";
import type { PublicCabin } from "../../../packages/shared/protocol";
import { cabinDesignForPlot, cabinYaw } from "./cabin-designs";
import { cabinSpots, southShore, terrainHeight } from "./geography";
function woodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#b38b60";
  ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 36; i++) {
    const x = (i * 47) % 128;
    ctx.strokeStyle = i % 3 ? "#a57c53" : "#c79d6d";
    ctx.lineWidth = 1 + (i % 2);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 8, 80, x - 7, 150, x + 4, 256);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 2);
  return t;
}
// Fixed image-reference archetypes. Randomization selects a complete design,
// rather than independently distorting roof, window, and structural proportions.
export function Cabin({
  index,
  x,
  z,
  flat,
  interiorActive = false,
  ownerName = null,
}: {
  index: number;
  x: number;
  z: number;
  flat: boolean;
  interiorActive?: boolean;
  ownerName?: string | null;
}) {
  const design = cabinDesignForPlot(index);
  const ownerPlaque = useTexture("/assets/ui/sign-plaque.webp");
  ownerPlaque.colorSpace = THREE.SRGBColorSpace;
  const ownerWidth = Math.max(
    0.85,
    Math.min(1.7, 0.31 + (ownerName?.length ?? 0) * 0.095),
  );
  const ownerHeight = (ownerName?.length ?? 0) > 18 ? 0.38 : 0.26;
  const archetype = design.key;
  const { scene } = useGLTF(assetUrl("Lake_Cabin_" + archetype));
  const model = useMemo(() => {
    const object = scene.clone(true);
    object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (flat) {
          const strip = (source: THREE.Material) => {
            const m = source.clone() as THREE.MeshStandardMaterial;
            m.map = null;
            m.normalMap = null;
            return m;
          };
          o.material = Array.isArray(o.material)
            ? o.material.map(strip)
            : strip(o.material);
        }
      }
    });
    return object;
  }, [scene, flat]);
  const cutaway = useMemo(
    () => (interiorActive ? cabinCutawayBase(model) : null),
    [model, interiorActive],
  );
  useEffect(
    () => () => {
      cutaway?.traverse((node) => {
        if (node instanceof THREE.Mesh) node.geometry.dispose();
      });
    },
    [cutaway],
  );
  const [plaqueX, plaqueY, plaqueZ] = design.numberMount;
  return (
    <group
      position={[x, terrainHeight(x, z), z]}
      rotation={[0, cabinYaw(index), 0]}
    >
      <StaticCollider object={cutaway ?? scene} />
      <primitive object={cutaway ?? model} dispose={null} />
      <CabinBenchSeats index={index} />
      <group visible={!interiorActive}>
        <mesh position={[plaqueX, plaqueY, plaqueZ]}>
          <boxGeometry args={[0.36, 0.4, 0.035]} />
          <meshStandardMaterial color="#263c40" roughness={0.9} />
        </mesh>
        {/* Empty glyph geometry must wait for Troika's first asynchronous sync. */}
        <Text
          geometry-instanceCount={0}
          position={[plaqueX, plaqueY, plaqueZ + 0.022]}
          font="/fonts/barlow-condensed-latin-600-normal.woff"
          fontSize={0.22}
          color="#e7e7d5"
          anchorX="center"
          anchorY="middle"
        >
          {String(index + 1)}
          {/* R3F owns the base material; disposal also releases Troika's derived shaders. */}
          <meshBasicMaterial
            color="#ffffff"
            side={THREE.DoubleSide}
            transparent
          />
        </Text>
        {
          <group
            visible={!!ownerName}
            position={[plaqueX, plaqueY - 0.45, plaqueZ + 0.035]}
          >
            <mesh>
              <planeGeometry args={[ownerWidth, ownerHeight]} />
              <meshStandardMaterial
                map={ownerPlaque}
                roughness={0.9}
                transparent
                alphaTest={0.1}
              />
            </mesh>
            <Text
              geometry-instanceCount={0}
              position={[0, 0, 0.003]}
              font="/fonts/AlegreyaSans-Bold.ttf"
              fontSize={0.13}
              maxWidth={ownerWidth - 0.25}
              lineHeight={1.1}
              overflowWrap="break-word"
              color="#f3e5c9"
              anchorX="center"
              anchorY="middle"
            >
              {ownerName ?? " "}
              <meshBasicMaterial
                color="#ffffff"
                side={THREE.DoubleSide}
                transparent
              />
            </Text>
          </group>
        }
      </group>
    </group>
  );
}
function Dock({ x, flat }: { x: number; flat: boolean }) {
  const z = southShore(x);
  const deck = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#a88d65",
        map: flat ? null : woodTexture(),
        roughness: 0.9,
      }),
    [flat],
  );
  return (
    <group position={[x, 0.85, z - 4.1]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[1.7, 0.12, 7.2]}
          position={[0, -0.08, 0]}
          friction={1.4}
        />
        {[-1.5, 1.5].flatMap((a) =>
          [-6, -2, 2, 6].map((b) => (
            <CuboidCollider
              key={`${a}-${b}`}
              args={[0.16, 1.3, 0.16]}
              position={[a, -0.7, b]}
            />
          )),
        )}
        {[-1.6, 1.6].map((a) => (
          <CuboidCollider
            key={a}
            args={[0.13, 0.75, 0.13]}
            position={[a, 0.6, 6]}
          />
        ))}
      </RigidBody>
      {Array.from({ length: 24 }, (_, i) => (
        <mesh
          key={i}
          position={[0, 0, -6.9 + i * 0.6]}
          material={deck}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[3.4, 0.15, 0.56]} />
        </mesh>
      ))}
      {[-1.5, 1.5].flatMap((a) =>
        [-6, -2, 2, 6].map((b) => (
          <mesh key={`${a}-${b}`} position={[a, -0.7, b]} castShadow>
            <cylinderGeometry args={[0.15, 0.2, 2.6, 8]} />
            <meshStandardMaterial color="#675d44" roughness={1} />
          </mesh>
        )),
      )}
      {[-1.6, 1.6].map((a) => (
        <mesh key={a} position={[a, 0.6, 6]} castShadow>
          <cylinderGeometry args={[0.11, 0.14, 1.5, 8]} />
          <meshStandardMaterial color="#77684d" />
        </mesh>
      ))}
    </group>
  );
}
export function Settlement({
  flat,
  interiorIndex = null,
  cabins,
  arrivalIndex,
}: {
  flat: boolean;
  interiorIndex?: number | null;
  cabins: readonly PublicCabin[];
  arrivalIndex?: number;
}) {
  return (
    <>
      {cabins.map((home) => {
        const c = cabinSpots[home.index];
        const cabin = (
          <Cabin
            key={c.i}
            index={c.i}
            x={c.x}
            z={c.z}
            flat={flat}
            interiorActive={interiorIndex === c.i}
            ownerName={home.ownerName}
          />
        );
        // A newly joining friend's first archetype/font must not hide the whole
        // running world. Our own arrival cabin still gates the initial loader.
        return c.i === arrivalIndex ? (
          cabin
        ) : (
          <Suspense key={c.i} fallback={null}>
            {cabin}
          </Suspense>
        );
      })}
      <Dock x={0} flat={flat} />
      <Dock x={-235} flat={flat} />
      <Suspense fallback={null}>
        <CruceStation flat={flat} />
      </Suspense>
      <Suspense fallback={null}>
        <PlanesStation flat={flat} />
      </Suspense>
      <FireCircle />
      {[-68, -45, -22, 5, 28, 55].map((x, i) => {
        const zz = southShore(x) + 13;
        return (
          <Model
            key={i}
            id="Prop_WoodenFence_Single"
            height={0.85}
            position={[x, terrainHeight(x, zz), zz]}
            flat={flat}
          />
        );
      })}
    </>
  );
}

export const fireCircleSpot = { x: 36, z: southShore(36) + 17 };
function FireCircle() {
  const { x, z } = fireCircleSpot,
    y = terrainHeight(x, z);
  return (
    <group position={[x, y, z]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[1.3, 0.22, 1.3]}
          position={[0, 0.1, 0]}
          friction={1.4}
        />
      </RigidBody>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.015, 0]}
        receiveShadow
      >
        <circleGeometry args={[5.8, 40]} />
        <meshStandardMaterial color="#a29372" roughness={1} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[1.1, 1.1, 0.12, 20]} />
        <meshStandardMaterial color="#423d36" roughness={1} />
      </mesh>
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i * Math.PI * 2) / 14;
        return (
          <mesh
            key={i}
            position={[Math.sin(a) * 1.15, 0.18, Math.cos(a) * 1.15]}
            rotation={[0, a, 0]}
            castShadow
          >
            <dodecahedronGeometry args={[0.28, 0]} />
            <meshStandardMaterial color="#777c70" roughness={1} />
          </mesh>
        );
      })}
      <CampfireLogs />
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2;
        return (
          <Bench
            key={i}
            benchId={`campfire-${i}`}
            height={0.55}
            bench={{
              id: `campfire-${i}`,
              label: "Campfire bench",
              facingOffset: Math.PI,
            }}
            position={[Math.sin(a) * 3.6, 0, Math.cos(a) * 3.6]}
            rotation={a}
          />
        );
      })}
    </group>
  );
}
