import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, OrbitControls } from "@react-three/drei";
import { Ecctrl, type EcctrlHandle } from "ecctrl";
import { useRapier } from "@react-three/rapier";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { assetUrl } from "./assets";
import { cabinDesigns, cabinDesignForPlot } from "./cabin-designs";
import { terrainHeight, inWater, southShore, cabinSpots } from "./geography";
import { getActivityPose } from "./activity-state";
import { Scooter, type ScooterHandle } from "./scooter";
import { createScooterRiderRig } from "./scooter-rider";
import {
  getVehicleState,
  mountVehicle,
  parkVehicle,
  updateVehicleMotion,
} from "./vehicle-state";
import {
  advanceJumpMotion,
  initialJumpMotion,
  jumpAnimation,
} from "./locomotion-animation";
import { scooterHeading, scooterSpeed } from "./scooter-controls";
import {
  activityAnimation,
  activityElapsed,
  activitySeatLift,
  createCharacterActivityRig,
  createFishingGestureClips,
  localFacing,
} from "./character-actions";
export type ViewMode = "walk" | "overview" | "study" | "settlement" | "home";
export const spawn = { x: 45, z: southShore(45) + 12 };
export const playerPosition = new THREE.Vector3(
  spawn.x,
  terrainHeight(spawn.x, spawn.z) + 1,
  spawn.z,
);
export function Avatar({
  position,
  rotation = 0,
  state = "Idle_Neutral",
  onReady,
}: {
  position?: [number, number, number];
  rotation?: number;
  state?: string;
  onReady?: (obj: THREE.Group) => void;
}) {
  const { scene, animations } = useGLTF(assetUrl("Lakeside_Man"));
  const group = useRef<THREE.Group>(null);
  const object = useMemo(() => {
    const obj = clone(scene);
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return obj;
  }, [scene]);
  const { actions } = useAnimations(animations, object);
  useEffect(() => {
    const action = actions[state] ?? actions.Idle;
    action?.reset().fadeIn(0.2).play();
    return () => {
      action?.fadeOut(0.2);
    };
  }, [actions, state]);
  useEffect(() => {
    if (group.current) onReady?.(group.current);
  }, [onReady]);
  return (
    <group ref={group} position={position} rotation={[0, rotation, 0]}>
      <primitive object={object} dispose={null} />
    </group>
  );
}
export function Player({
  mode,
  resetKey,
  paused,
  onMove,
  onMotion,
  onVehicleChange,
  onVehicleHint,
}: {
  mode: ViewMode;
  resetKey: number;
  paused: boolean;
  onMove: (moving: boolean) => void;
  onMotion: (sample: Record<string, unknown>) => void;
  onVehicleChange?: (mounted: boolean) => void;
  onVehicleHint?: (near: boolean) => void;
}) {
  const controller = useRef<EcctrlHandle>(null);
  const { world, rapier } = useRapier();
  const visual = useRef<THREE.Group>(null);
  const keys = useRef(new Set<string>());
  const moving = useRef(false);
  const [riding, setRiding] = useState(false);
  const rideYaw = useRef(Math.PI / 2),
    scooter = useRef<ScooterHandle>(null);
  const riderRig = useRef<ReturnType<typeof createScooterRiderRig> | null>(
    null,
  );
  const jumpState = useRef(initialJumpMotion()),
    jumpRequest = useRef(false);
  const nearScooter = useRef(false),
    parkedGrounded = useRef(false);
  const rideForward = useMemo(() => new THREE.Vector3(), []);

  const animation = useRef("Idle_Neutral");
  const animationHistory = useRef<
    { animation: string; at: number; y: number }[]
  >([]);
  const sampleClock = useRef(0);
  const anchored = useRef(false);
  const lastActivityStart = useRef(-1);
  const gestureAnimation = useRef<string | null>(null);
  const facingParent = useMemo(() => new THREE.Quaternion(), []);
  const facingTarget = useMemo(() => new THREE.Quaternion(), []);
  const lastMovingAlignment = useRef<number | null>(null);
  const { scene, animations } = useGLTF(assetUrl("Lakeside_Man"));
  const object = useMemo(() => {
    const obj = clone(scene);
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return obj;
  }, [scene]);
  const supplemental = useLoader(
    THREE.FileLoader,
    "/assets/animations/character-actions.json",
  );
  const allAnimations = useMemo(() => {
    const data = JSON.parse(String(supplemental)) as {
      clips: Parameters<typeof THREE.AnimationClip.parse>[0][];
    };
    return [
      ...animations,
      ...data.clips.map((clip) => THREE.AnimationClip.parse(clip)),
      ...createFishingGestureClips(),
    ];
  }, [animations, supplemental]);
  const { actions, mixer } = useAnimations(allAnimations, object);
  const activityRig = useRef<ReturnType<
    typeof createCharacterActivityRig
  > | null>(null);
  useEffect(() => {
    const rig = createCharacterActivityRig(object);
    activityRig.current = rig;
    return () => {
      rig.dispose();
      activityRig.current = null;
    };
  }, [object]);
  useEffect(() => {
    actions.Idle_Neutral?.play();
  }, [actions]);
  useEffect(() => {
    const rig = createScooterRiderRig(
      object,
      animations.find((clip) => clip.name === "Idle_Neutral"),
    );
    riderRig.current = rig;
    return () => {
      rig.dispose();
      riderRig.current = null;
    };
  }, [object, animations]);
  useEffect(() => {
    onVehicleChange?.(riding);
  }, [riding, onVehicleChange]);
  const floorAt = (x: number, z: number) => {
    const hit = world.castRay(
      new rapier.Ray({ x, y: 1000, z }, { x: 0, y: -1, z: 0 }),
      2000,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (c) =>
        (c.parent()?.userData as { terrain?: boolean } | undefined)?.terrain ===
        true,
    );
    return hit ? 1000 - hit.timeOfImpact : terrainHeight(x, z);
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName))
      )
        return;
      if (getVehicleState().mounted && ["KeyF", "KeyE"].includes(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (
        e.code === "KeyV" &&
        !e.repeat &&
        mode === "walk" &&
        !paused &&
        getActivityPose().kind === "none"
      ) {
        const body = controller.current?.body;
        if (!body || !controller.current?.isOnGround) return;
        e.preventDefault();
        if (getVehicleState().mounted) {
          const pos = body.translation(),
            floor = floorAt(pos.x, pos.z);
          parkVehicle([pos.x, floor, pos.z], rideYaw.current);
          const sideX = pos.x + Math.cos(rideYaw.current) * 0.65,
            sideZ = pos.z - Math.sin(rideYaw.current) * 0.65;
          if (!inWater(sideX, sideZ))
            body.setTranslation(
              { x: sideX, y: floorAt(sideX, sideZ) + 0.95, z: sideZ },
              true,
            );
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          riderRig.current?.reset();
          mixer.stopAllAction();
          animation.current = "";
          setRiding(false);
        } else {
          const parked = getVehicleState();
          if (
            Math.hypot(
              playerPosition.x - parked.parked[0],
              playerPosition.z - parked.parked[2],
            ) > 3.5 ||
            jumpState.current.phase !== "grounded"
          )
            return;
          rideYaw.current = parked.yaw;
          mountVehicle();
          body.setTranslation(
            {
              x: parked.parked[0],
              y: floorAt(parked.parked[0], parked.parked[2]) + 0.95,
              z: parked.parked[2],
            },
            true,
          );
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          setRiding(true);
        }
        keys.current.clear();
        jumpRequest.current = false;
        jumpState.current = initialJumpMotion();
        return;
      }
      if (e.code === "Space" && !e.repeat) jumpRequest.current = true;
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space",
          "ShiftLeft",
          "ShiftRight",
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [mode, paused, mixer]);
  useEffect(() => {
    controller.current?.body?.setTranslation(
      { x: spawn.x, y: terrainHeight(spawn.x, spawn.z) + 2, z: spawn.z },
      true,
    );
    controller.current?.body?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    keys.current.clear();
    jumpRequest.current = false;
    jumpState.current = initialJumpMotion();
    riderRig.current?.reset();
    mixer.stopAllAction();
    animation.current = "";
    setRiding(false);
    const x = spawn.x + 3,
      z = spawn.z + 2;
    parkVehicle([x, terrainHeight(x, z), z], Math.PI / 2);
    parkedGrounded.current = false;
  }, [resetKey]);
  useFrame((_, dt) => {
    const c = controller.current;
    if (!c || !c.body) return;
    const k = keys.current;
    const mounted = getVehicleState().mounted;
    if (!mounted && !parkedGrounded.current) {
      const parked = getVehicleState().parked;
      parkVehicle(
        [parked[0], floorAt(parked[0], parked[2]), parked[2]],
        getVehicleState().yaw,
      );
      parkedGrounded.current = true;
    }
    const pose = getActivityPose();
    const activity = activityAnimation(pose.kind);
    const holding = activity !== null && pose.anchor !== undefined;
    const elapsed = activityElapsed(pose, performance.now());
    if (holding && pose.anchor) {
      if (!anchored.current) {
        c.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        c.body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
        anchored.current = true;
        keys.current.clear();
      }
      const [x, floor, z] = pose.anchor;
      const anchor = { x, y: floor + 0.95, z };
      c.body.setTranslation(anchor, true);
      c.body.setNextKinematicTranslation(anchor);
    } else if (anchored.current) {
      c.body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      c.body.resetForces(true);
      c.body.resetTorques(true);
      c.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      anchored.current = false;
      keys.current.clear();
    }
    const active = mode === "walk" && !paused && !holding;
    const steer =
      active && mounted
        ? Number(k.has("KeyD") || k.has("ArrowRight")) -
          Number(k.has("KeyA") || k.has("ArrowLeft"))
        : 0;
    if (mounted) {
      rideYaw.current = scooterHeading(
        rideYaw.current,
        steer,
        Math.hypot(c.currLinVel.x, c.currLinVel.z),
        dt,
      );
      rideForward.set(Math.sin(rideYaw.current), 0, Math.cos(rideYaw.current));
      c.setForwardDir(rideForward);
      if (active && (k.has("KeyS") || k.has("ArrowDown"))) {
        const v = c.body.linvel(),
          brake = Math.exp(-scooterSpeed.brakeRate * dt);
        c.body.setLinvel({ x: v.x * brake, y: v.y, z: v.z * brake }, true);
      }
    }
    const jumpStarted =
      active && !mounted && jumpRequest.current && c.isOnGround;
    jumpRequest.current = false;
    jumpState.current = advanceJumpMotion(jumpState.current, {
      now: performance.now() / 1000,
      grounded: c.isOnGround,
      verticalSpeed: c.currLinVel.y,
      jumpStarted,
      disabled: holding || mounted,
    });
    c.setMovement({
      forward: active && (k.has("KeyW") || k.has("ArrowUp")),
      backward: active && !mounted && (k.has("KeyS") || k.has("ArrowDown")),
      leftward: active && !mounted && (k.has("KeyA") || k.has("ArrowLeft")),
      rightward: active && !mounted && (k.has("KeyD") || k.has("ArrowRight")),
      run: active && (k.has("ShiftLeft") || k.has("ShiftRight")),
      jump: active && !mounted && k.has("Space"),
    });
    const p = c.body.translation();
    playerPosition.set(p.x, p.y, p.z);
    if (
      !holding &&
      (p.y < -5 || Math.abs(p.x) > 2100 || Math.abs(p.z) > 1450)
    ) {
      c.body.setTranslation(
        { x: spawn.x, y: terrainHeight(spawn.x, spawn.z) + 1.6, z: spawn.z },
        true,
      );
      c.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    // A shape-cast witness can sit on the floating capsule instead of the ground.
    // Use a downward ray excluding this body to anchor soles to the rendered collider.
    const ground = world.castRay(
      new rapier.Ray(p, { x: 0, y: -1, z: 0 }),
      2,
      true,
      undefined,
      undefined,
      undefined,
      c.body,
    );
    const groundY = holding
      ? pose.anchor![1]
      : ground
        ? p.y - ground.timeOfImpact
        : null;
    if (visual.current)
      visual.current.position.y = holding
        ? -0.95 + activitySeatLift(pose, elapsed)
        : c.isOnGround && groundY !== null && c.currLinVel.y < 0.8
          ? groundY - p.y + 0.015
          : -0.8;
    const speed = holding ? 0 : Math.hypot(c.currLinVel.x, c.currLinVel.z);
    const jumpClip = jumpAnimation(jumpState.current.phase),
      clipConfig = activity ?? jumpClip;
    const next =
      activity?.name ??
      (mounted
        ? "Idle_Neutral"
        : (jumpClip?.name ??
          (speed > 0.3 ? (speed > 4 ? "Run" : "Walk") : "Idle_Neutral")));
    if (
      next !== animation.current ||
      (activity && lastActivityStart.current !== pose.startedAt)
    ) {
      animationHistory.current.push({
        animation: next,
        at: performance.now(),
        y: p.y,
      });
      if (animationHistory.current.length > 12)
        animationHistory.current.shift();
      actions[animation.current]?.fadeOut(0.14);
      const action = actions[next];
      if (action) {
        action.reset();
        action.setLoop(
          clipConfig && !clipConfig.loop ? THREE.LoopOnce : THREE.LoopRepeat,
          Infinity,
        );
        action.clampWhenFinished = Boolean(clipConfig && !clipConfig.loop);
        action.setEffectiveTimeScale(
          clipConfig ? action.getClip().duration / clipConfig.duration : 1,
        );
        action.fadeIn(jumpClip?.loop === false ? 0.06 : 0.14).play();
      }
      animation.current = next;
      lastActivityStart.current = pose.startedAt;
    }
    if (visual.current) {
      const angle = holding
        ? pose.facing
        : mounted
          ? rideYaw.current
          : speed > 0.3
            ? Math.atan2(c.currLinVel.x, c.currLinVel.z)
            : undefined;
      if (angle !== undefined) {
        visual.current.parent?.getWorldQuaternion(facingParent);
        localFacing(angle, facingParent, facingTarget);
        if (holding) visual.current.quaternion.copy(facingTarget);
        else
          visual.current.quaternion.slerp(facingTarget, 1 - Math.exp(-12 * dt));
      }
    }
    const gesture =
      pose.kind === "reel"
        ? "Activity_ReelGesture"
        : pose.kind === "bite"
          ? "Activity_BiteGesture"
          : null;
    if (gesture !== gestureAnimation.current) {
      if (gestureAnimation.current)
        actions[gestureAnimation.current]?.fadeOut(0.12);
      if (gesture)
        actions[gesture]?.reset().setEffectiveWeight(1).fadeIn(0.12).play();
      gestureAnimation.current = gesture;
    }
    activityRig.current?.update(pose, elapsed);
    if (mounted) {
      const signedSpeed =
        c.currLinVel.x * Math.sin(rideYaw.current) +
        c.currLinVel.z * Math.cos(rideYaw.current);
      scooter.current?.update({ speed: signedSpeed, steer, dt });
      riderRig.current?.update({
        speed: signedSpeed,
        steer: scooter.current?.steeringAngle ?? 0,
      });
      updateVehicleMotion(rideYaw.current, signedSpeed);
    }
    sampleClock.current += dt;
    if (sampleClock.current > 1 / 7 && visual.current) {
      sampleClock.current = 0;
      const feet = visual.current.getWorldPosition(new THREE.Vector3());
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(
        visual.current.getWorldQuaternion(new THREE.Quaternion()),
      );
      if (speed > 0.3)
        lastMovingAlignment.current =
          (facing.x * c.currLinVel.x + facing.z * c.currLinVel.z) / speed;
      const near =
        mode === "walk" &&
        !paused &&
        !mounted &&
        Math.hypot(
          p.x - getVehicleState().parked[0],
          p.z - getVehicleState().parked[2],
        ) <= 3.5;
      if (near !== nearScooter.current) {
        nearScooter.current = near;
        onVehicleHint?.(near);
      }
      onMotion({
        vehicle: mounted ? "QuickVolt 9" : null,
        vehicleSpeed: mounted ? getVehicleState().speed : 0,
        jumpPhase: jumpState.current.phase,
        animationHistory: animationHistory.current,
        position: [p.x, p.y, p.z],
        feet: feet.toArray(),
        contact: c.standPoint.toArray(),
        grounded: holding || c.isOnGround,
        activity: pose.kind,
        animation: next,
        groundY,
        velocity: [c.currLinVel.x, c.currLinVel.y, c.currLinVel.z],
        facing: facing.toArray(),
        inWater: inWater(p.x, p.z),
        lastMovingAlignment: lastMovingAlignment.current,
        facingDot:
          speed > 0.3
            ? (facing.x * c.currLinVel.x + facing.z * c.currLinVel.z) / speed
            : null,
      });
    }
    if (moving.current !== speed > 0.3) {
      moving.current = speed > 0.3;
      onMove(moving.current);
    }
  });
  return (
    <Ecctrl
      ref={controller}
      position={[spawn.x, terrainHeight(spawn.x, spawn.z) + 2, spawn.z]}
      enabledRotations={[false, false, false]}
      autoBalance={false}
      capsuleHalfHeight={0.35}
      capsuleRadius={0.3}
      ccd
      useCustomForward={riding}
      maxWalkVel={riding ? scooterSpeed.cruise : 3.8}
      maxRunVel={riding ? scooterSpeed.boost : 6.5}
      jumpVel={4.5}
      floatHeight={0.3}
    >
      <group ref={visual} position={[0, -0.9, 0]}>
        <primitive object={object} dispose={null} />
        <Scooter ref={scooter} visible={riding} />
      </group>
    </Ecctrl>
  );
}
export function CameraRig({
  mode,
  resetKey,
  homeIndex = 18,
}: {
  mode: ViewMode;
  resetKey: number;
  homeIndex?: number;
}) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const [cabinVariant, setCabinVariant] = useState(0);
  useEffect(() => {
    const inspect = (event: KeyboardEvent) => {
      if (
        mode === "settlement" &&
        ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].includes(
          event.code,
        )
      )
        setCabinVariant(Number(event.code.slice(-1)) - 1);
    };
    window.addEventListener("keydown", inspect);
    return () => window.removeEventListener("keydown", inspect);
  }, [mode]);
  const { camera } = useThree();
  const last = useRef(new THREE.Vector3());
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (mode === "overview") {
      camera.position.set(390, 290, southShore(0) + 500);
      c.target.set(0, 10, southShore(0) + 80);
    } else if (mode === "home") {
      const plot = cabinSpots[homeIndex];
      camera.position.set(plot.x + 10, plot.ground + 8, plot.z - 16);
      c.target.set(plot.x, plot.ground + 2, plot.z);
    } else if (mode === "settlement") {
      const desired = cabinDesigns[cabinVariant];
      const plot =
        cabinSpots.find((p) => cabinDesignForPlot(p.i).key === desired.key) ??
        cabinSpots[18];
      camera.position.set(plot.x + 8, plot.ground + 7, plot.z - 13);
      c.target.set(plot.x, plot.ground + 2, plot.z);
    } else if (mode === "study") {
      camera.position.copy(playerPosition).add(new THREE.Vector3(4, 1.4, 5));
      c.target.copy(playerPosition).add(new THREE.Vector3(0, 0.1, 0));
    } else {
      camera.position.copy(playerPosition).add(new THREE.Vector3(5, 3.4, 7));
      c.target.copy(playerPosition).add(new THREE.Vector3(0, 0.8, 0));
    }
    last.current.copy(playerPosition);
    c.update();
  }, [mode, camera, resetKey, cabinVariant, homeIndex]);
  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    if (mode === "walk" || mode === "study") {
      const delta = playerPosition.clone().sub(last.current);
      camera.position.add(delta);
      c.target
        .copy(playerPosition)
        .add(new THREE.Vector3(0, mode === "study" ? 0.1 : 0.65, 0));
      last.current.copy(playerPosition);
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={
        mode === "overview" || mode === "settlement" || mode === "home"
      }
      minDistance={
        mode === "overview" || mode === "settlement" || mode === "home"
          ? 8
          : 2.5
      }
      maxDistance={
        mode === "overview" || mode === "settlement" || mode === "home"
          ? 1600
          : 22
      }
      maxPolarAngle={Math.PI * 0.47}
      minPolarAngle={0.15}
      enableDamping
      dampingFactor={0.08}
      zoomSpeed={0.8}
      rotateSpeed={0.55}
    />
  );
}
export function Crowd({ enabled }: { enabled: boolean }) {
  const positions = useMemo(
    () =>
      Array.from({ length: 29 }, (_, i) => {
        const x = spawn.x - 15 + (i % 10) * 3,
          z = southShore(x) + 10 + Math.floor(i / 10) * 2.5;
        return [x, terrainHeight(x, z), z] as [number, number, number];
      }),
    [],
  );
  return enabled ? (
    <>
      {positions.map((p, i) => (
        <Avatar
          key={i}
          position={p}
          rotation={i * 0.77}
          state={i % 4 === 0 ? "Wave" : "Idle_Neutral"}
        />
      ))}
    </>
  ) : null;
}
