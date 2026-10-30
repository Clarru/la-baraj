/** Local-only real Player/Ecctrl QA; synthetic room, no sockets or persistent homes. */
import React, { Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Physics,
  RigidBody,
  CuboidCollider,
  useRapier,
  useAfterPhysicsStep,
} from "@react-three/rapier";
import * as THREE from "three";
import { Player, CameraRig } from "../../apps/web/src/player";
import { homeSpawn } from "../../apps/web/src/home";
import { LocalPlanesRoom } from "../../apps/web/src/PlanesLab";
import actions from "../../apps/web/public/assets/animations/character-actions.json";
THREE.Cache.enabled = true;
THREE.Cache.add(
  "file:/assets/animations/character-actions.json",
  JSON.stringify(actions),
);
const room = new LocalPlanesRoom("Controller QA");
const stop = room.connect();
window.addEventListener("pagehide", stop);
const arrival = homeSpawn(0),
  [x, y, z] = arrival.position;
const output = document.querySelector("#motion")!;
const samples: Record<string, unknown>[] = [];
function Probe() {
  const { world } = useRapier();
  useAfterPhysicsStep(() => {
    world.forEachRigidBody((b) => {
      if (b.isDynamic())
        output.setAttribute(
          "data-physics-after-step",
          JSON.stringify({
            body: b.translation(),
            rotation: b.collider(0).rotation(),
          }),
        );
    });
  });
  useFrame(() => {
    world.forEachRigidBody((body) => {
      if (!body.isDynamic()) return;
      const c = body.collider(0);
      output.setAttribute(
        "data-physics",
        JSON.stringify({
          body: body.translation(),
          rotation: c.rotation(),
          shape: c.shape,
          groundedHeight: body.translation().y - y,
        }),
      );
    });
  });
  return null;
}
function App() {
  const [reset, setReset] = useState(0);
  return (
    <>
      <Canvas shadows camera={{ position: [x + 4, y + 3, z + 5], fov: 42 }}>
        <color attach="background" args={["#ccd7d0"]} />
        <hemisphereLight intensity={2.5} />
        <directionalLight
          castShadow
          position={[x + 5, y + 8, z + 5]}
          intensity={3}
        />
        <Suspense fallback={null}>
          <Physics>
            <RigidBody type="fixed" userData={{ terrain: true }}>
              <CuboidCollider args={[20, 0.1, 20]} position={[x, y - 0.1, z]} />
              <mesh position={[x, y - 0.1, z]} receiveShadow>
                <boxGeometry args={[40, 0.2, 40]} />
                <meshStandardMaterial color="#94a683" />
              </mesh>
            </RigidBody>
            <RigidBody type="fixed">
              <CuboidCollider
                args={[2, 0.1, 2]}
                position={[x, y + 1.3, z + 5]}
              />
              <mesh position={[x, y + 1.3, z + 5]} castShadow receiveShadow>
                <boxGeometry args={[4, 0.2, 4]} />
                <meshStandardMaterial
                  color="#776c59"
                  transparent
                  opacity={0.65}
                />
              </mesh>
            </RigidBody>
            <Player
              homeIndex={0}
              mode="walk"
              resetKey={reset}
              paused={false}
              onMove={() => {}}
              onMotion={(sample) => {
                samples.push(sample);
                if (samples.length > 30) samples.shift();
                output.setAttribute("data-samples", JSON.stringify(samples));
                room.publishMotion(sample);
                output.textContent = JSON.stringify(sample, null, 2);
                output.setAttribute("data-motion", JSON.stringify(sample));
              }}
            />
            <Probe />
          </Physics>
          <CameraRig mode="walk" homeIndex={0} resetKey={reset} />
        </Suspense>
      </Canvas>
      <aside>
        <strong>Actual controller QA · isolated in RAM</strong>
        <p>
          C crouch · Z prone · G wave · WASD move · Space jump. Low ceiling is
          1.2m above the floor, five metres along +Z.
        </p>
        <button onClick={() => setReset((v) => v + 1)}>Reset player</button>
        <pre id="help">No production socket or saved homes.</pre>
      </aside>
    </>
  );
}
createRoot(document.querySelector("#app")!).render(<App />);
