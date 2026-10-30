/** Close-up of the actual retained mesh, seated animation and Cruce controller. No sockets. */
import React, { Suspense, useMemo, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import * as T from "three";
import {
  createCruceCharacterRig,
  cruceBackTexture,
} from "../../apps/web/src/cruce-character";
import {
  cloneCharacter,
  disposeCharacterSkeletons,
} from "../../apps/web/src/character-resources";
import { CruceStation } from "../../apps/web/src/CruceStation";
import {
  CRUCE_TABLE,
  cruceSeatPose,
} from "../../packages/shared/cruce-station";
import { freshCruce, type CruceView } from "../../packages/shared/cruce";
import actions from "../../apps/web/public/assets/animations/character-actions.json";
const pose = cruceSeatPose(0);
const world = (p: number[]) =>
  new T.Vector3(...(p as [number, number, number]))
    .applyAxisAngle(new T.Vector3(0, 1, 0), pose.yaw)
    .add(new T.Vector3(...pose.position));
const focus = world([0, 0.96, 0.13]);
const cameras = {
  front: [0, 1.18, 1.3],
  grip: [0.65, 1.12, 0.65],
  free: [-0.65, 1.05, 0.65],
  side: [0.9, 1.1, 0.05],
  contact: [2.5, 0.9, 0.1],
};
function Camera({ view }: { view: keyof typeof cameras }) {
  const { camera } = useThree();
  const target = view === "contact" ? world([0, 0.68, 0.12]) : focus;
  useEffect(() => {
    camera.position.copy(world(cameras[view]));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }, [camera, view]);
  return <OrbitControls target={target.toArray()} />;
}
function Character({ play, count }: { play: boolean; count: number }) {
  const { scene } = useGLTF("/assets/optimized/Lakeside_Man.glb");
  const actor = useMemo(() => {
    const obj = cloneCharacter(scene);
    obj.position.fromArray(pose.position);
    obj.rotation.y = pose.yaw;
    return obj;
  }, [scene]);
  const mixer = useMemo(() => new T.AnimationMixer(actor), [actor]);
  const rig = useMemo(
    () => createCruceCharacterRig(actor, cruceBackTexture()),
    [actor],
  );
  const clock = useRef(-1),
    initialized = useRef(false);
  const v = useMemo(
    () =>
      ({
        ...freshCruce(),
        phase: "playing",
        version: 1,
        revision: 1,
        you: 0,
        round: 1,
        hand: Array.from({ length: count }, (_, i) => i),
        handCounts: [count, count, count, count],
        trick: [],
        players: [null, null, null, null],
        legalCards: [],
        host: 0,
        deadline: null,
        stockCount: 0,
      }) as CruceView,
    [count],
  );
  useEffect(() => {
    const clip = T.AnimationClip.parse(
      actions.clips.find((c) => c.name === "Activity_Sit")! as Parameters<
        typeof T.AnimationClip.parse
      >[0],
    );
    mixer.clipAction(clip).play();
    mixer.setTime(0.4);
    return () => {
      rig.dispose();
      mixer.stopAllAction();
      disposeCharacterSkeletons(actor);
    };
  }, [mixer, rig, actor]);
  useFrame(({ clock: time }, delta) => {
    rig.beginFrame();
    mixer.update(delta);
    if (!initialized.current) {
      rig.update(v, 0, 1000);
      initialized.current = true;
      if (!play) return;
    }
    if (!play) {
      rig.update(v, 0, 1000);
      return;
    }
    if (clock.current < 0) {
      clock.current = time.elapsedTime;
      rig.beginFrame();
      rig.update(
        {
          ...v,
          hand: v.hand.slice(1),
          handCounts: [count - 1, count, count, count],
          trick: [{ seat: 0, card: 0, announcement: 0 }],
        },
        0,
        2000,
      );
      return;
    }
    rig.update(
      {
        ...v,
        hand: v.hand.slice(1),
        handCounts: [count - 1, count, count, count],
        trick: [{ seat: 0, card: 0, announcement: 0 }],
      },
      0,
      2000 + (time.elapsedTime - clock.current) * 1000,
    );
  });
  return <primitive object={actor} dispose={null} />;
}
function App() {
  const [view, setView] = useState<keyof typeof cameras>("front"),
    [play, setPlay] = useState(false),
    [round, setRound] = useState(0),
    [count, setCount] = useState(6);
  return (
    <>
      <Canvas
        shadows
        camera={{
          position: world(cameras.front).toArray(),
          fov: 35,
          near: 0.02,
          far: 100,
        }}
      >
        <color attach="background" args={["#b7bcae"]} />
        <hemisphereLight intensity={2.4} />
        <directionalLight
          position={[
            CRUCE_TABLE.x - 2,
            CRUCE_TABLE.ground + 5,
            CRUCE_TABLE.z + 3,
          ]}
          intensity={2.8}
          castShadow
        />
        <Suspense fallback={null}>
          <Physics paused>
            <CruceStation flat={false} />
          </Physics>
          <Character key={`${round}:${count}`} play={play} count={count} />
        </Suspense>
        <Camera view={view} />
      </Canvas>
      <aside>
        <strong>Cruce · actual rig hand QA</strong>
        {Object.keys(cameras).map((v) => (
          <button key={v} onClick={() => setView(v as keyof typeof cameras)}>
            {v}
          </button>
        ))}
        <button
          onClick={() => {
            setPlay(false);
            setRound((v) => v + 1);
          }}
        >
          Hold cards
        </button>
        <button
          onClick={() => {
            setPlay(true);
            setRound((v) => v + 1);
          }}
        >
          Play card
        </button>
        <label>
          Cards
          <select
            value={count}
            onChange={(e) => {
              setCount(+e.target.value);
              setPlay(false);
            }}
          >
            <option>6</option>
            <option>10</option>
          </select>
        </label>
      </aside>
    </>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
