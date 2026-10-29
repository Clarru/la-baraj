import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, OrbitControls } from "@react-three/drei";
import { Ecctrl, type EcctrlHandle } from "ecctrl";
import { useRapier } from "@react-three/rapier";
import * as THREE from "three";
import {
  cloneCharacter,
  characterClips,
  disposeCharacterSkeletons,
} from "./character-resources";
import { assetUrl } from "./assets";
import { currentMultiplayerRoom } from "./multiplayer";
import { createTableReactionRig } from "./table-reactions";
import {
  PLANES_TABLE,
  planesSeatSide,
} from "../../../packages/shared/planes-station";
import {
  takeCabinTransfer,
  interiorFloorOffset,
  cabinTransfer,
  sampleCabinMotion,
  cabinSoleOffset,
} from "./cabin-interior-state";
import { cabinDesigns, cabinDesignForPlot, cabinYaw } from "./cabin-designs";
import { terrainHeight, inWater, southShore, cabinSpots } from "./geography";
import { getActivityPose } from "./activity-state";
import { Scooter, type ScooterHandle } from "./scooter";
import { createScooterRiderRig } from "./scooter-rider";
import { Boat, type BoatHandle } from "./boat";
import { BOAT_FLOAT_HEIGHT } from "./boat-geometry";
import { createBoatRiderRig } from "./boat-rider";
import {
  BOAT_TUNING,
  advanceBoat,
  boatVelocity,
  createBoatMotionState,
  reconcileBoatSpeed,
} from "./boat-motion";
import {
  getBoatState,
  mountBoat,
  parkBoat,
  resetBoatToDock,
  updateBoatMotion,
  vehicleOccupied,
} from "./boat-state";
import {
  BOAT_BOARD_DISTANCE,
  boatBlockedAhead,
  boatExitCandidates,
  canBoardBoat,
  chooseBoatExit,
} from "./boat-placement";
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
import {
  scooterHeading,
  scooterSpeed,
  scooterSteeringInput,
} from "./scooter-controls";
import { homeSpawn, homeWalkCameraOffset } from "./home";
import { scooterSupportHeight } from "./scooter-support";
import {
  LAKE_LEVEL,
  SWIM_OFFSET,
  swimmingState,
  swimVelocity,
} from "./swim-motion";
import { SwimWake } from "./SwimWake";
import { StunStars } from "./StunStars";
import { bindCameraMouse } from "./camera-mouse";
import {
  activityAnimation,
  activityElapsed,
  activitySeatLift,
  createCharacterActivityRig,
  localFacing,
} from "./character-actions";
export type ViewMode = "walk" | "overview" | "study" | "settlement" | "home";
export const spawn = { x: 45, z: southShore(45) + 12 };
export const playerPosition = new THREE.Vector3(
  spawn.x,
  terrainHeight(spawn.x, spawn.z) + 1,
  spawn.z,
);
/** Camera follows the interpolated render body, not the discrete physics step. */
export const playerViewPosition = playerPosition.clone();
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
  const object = useMemo(() => cloneCharacter(scene), [scene]);
  const { actions } = useAnimations(animations, object);
  useEffect(() => () => disposeCharacterSkeletons(object), [object]);
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
  homeIndex,
  mode,
  resetKey,
  paused,
  onMove,
  onMotion,
  onVehicleChange,
  onVehicleHint,
  onBoatChange,
  onBoatHint,
  indoors = false,
  doorTransition = false,
}: {
  homeIndex: number;
  mode: ViewMode;
  resetKey: number;
  paused: boolean;
  onMove: (moving: boolean) => void;
  onMotion: (sample: Record<string, unknown>) => void;
  onVehicleChange?: (mounted: boolean) => void;
  onVehicleHint?: (near: boolean) => void;
  onBoatChange?: (mounted: boolean) => void;
  onBoatHint?: (near: boolean) => void;
  indoors?: boolean;
  doorTransition?: boolean;
}) {
  const arrival = useMemo(() => homeSpawn(homeIndex), [homeIndex]);
  const controller = useRef<EcctrlHandle>(null);
  const doorArrival = useRef<ReturnType<typeof takeCabinTransfer>>(null);
  const doorArrivalStarted = useRef(0);
  const { world, rapier } = useRapier();
  const camera = useThree((state) => state.camera);
  const visual = useRef<THREE.Group>(null);
  const keys = useRef(new Set<string>());
  const moving = useRef(false);
  const [riding, setRiding] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [swimming, setSwimming] = useState(false);
  const swimmingRef = useRef(false);
  const waterSample = useRef({
    elapsed: 1,
    x: Infinity,
    z: Infinity,
    wet: false,
    ground: 0,
    indoors: false,
  });
  const dryScooter = useRef<{
    x: number;
    z: number;
    bodyY: number;
    yaw: number;
  } | null>(null);
  const swimForward = useMemo(() => new THREE.Vector3(), []);
  const swimRight = useMemo(() => new THREE.Vector3(), []);
  const swimDirection = useMemo(() => new THREE.Vector3(), []);
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
  // Motorboat: Ecctrl is disabled and the body is driven by boatVelocity.
  const [boating, setBoating] = useState(false);
  const boatMotion = useRef(createBoatMotionState(0)),
    boat = useRef<BoatHandle>(null),
    nearBoat = useRef(false);
  const boatRider = useRef<ReturnType<typeof createBoatRiderRig> | null>(null);
  const leftGrip = useMemo(() => new THREE.Vector3(), []),
    rightGrip = useMemo(() => new THREE.Vector3(), []);

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
  const object = useMemo(() => cloneCharacter(scene), [scene]);
  const supplemental = useLoader(
    THREE.FileLoader,
    "/assets/animations/character-actions.json",
  );
  const allAnimations = useMemo(
    () => characterClips(animations, String(supplemental)),
    [animations, supplemental],
  );
  const { actions, mixer } = useAnimations(allAnimations, object);
  const tableReaction = useMemo(() => createTableReactionRig(object), [object]);
  useFrame(() => tableReaction.beginFrame(), -2);
  useEffect(() => () => tableReaction.dispose(), [tableReaction]);
  useEffect(() => () => disposeCharacterSkeletons(object), [object]);
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
    const rig = createBoatRiderRig(object);
    boatRider.current = rig;
    return () => {
      rig.dispose();
      boatRider.current = null;
    };
  }, [object]);
  useEffect(() => {
    onVehicleChange?.(riding);
  }, [riding, onVehicleChange]);
  useEffect(() => {
    onBoatChange?.(boating);
  }, [boating, onBoatChange]);
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
    const preventActionsWhileStunned = (event: KeyboardEvent) => {
      const room = currentMultiplayerRoom();
      if (!room?.stunned(room.getSnapshot().selfId)) return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))
      )
        return;
      if (["KeyE", "KeyF", "KeyV", "KeyQ", "Space"].includes(event.code)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", preventActionsWhileStunned, true);
    return () =>
      window.removeEventListener("keydown", preventActionsWhileStunned, true);
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName))
      )
        return;
      if (vehicleOccupied() && ["KeyF", "KeyE"].includes(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // Motorboat: V steps out toward the nearest bank, or boards when close.
      if (
        e.code === "KeyV" &&
        !indoors &&
        !e.repeat &&
        mode === "walk" &&
        !paused
      ) {
        const body = controller.current?.body;
        const parked = getBoatState();
        if (body && parked.mounted) {
          e.preventDefault();
          const pos = body.translation(),
            yaw = boatMotion.current.yaw;
          const exit = chooseBoatExit(
            boatExitCandidates(pos.x, pos.z, yaw),
            // The 3 m ray from here reaches LAKE_LEVEL - 0.75, below the wade depth.
            (x, z) => scooterSupportHeight(world, x, z, pos.y + 1.5, body),
          );
          parkBoat([pos.x, LAKE_LEVEL, pos.z], yaw);
          // A water exit lands at the surface; swim detection takes over next frame.
          const [x, y, z] = exit.position;
          body.setTranslation(
            { x, y: exit.kind === "land" ? y + 0.95 : y, z },
            true,
          );
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setGravityScale(1, true);
          boatRider.current?.reset();
          mixer.stopAllAction();
          animation.current = "";
          setBoating(false);
          keys.current.clear();
          jumpRequest.current = false;
          jumpState.current = initialJumpMotion();
          return;
        }
        if (
          body &&
          canBoardBoat({
            distance: Math.hypot(
              playerPosition.x - parked.parked[0],
              playerPosition.z - parked.parked[2],
            ),
            scooterMounted: getVehicleState().mounted,
            swimming: swimmingRef.current,
            grounded:
              Boolean(controller.current?.isOnGround) &&
              jumpState.current.phase === "grounded",
            indoors,
            activity: getActivityPose().kind,
            paused,
          })
        ) {
          e.preventDefault();
          boatMotion.current = createBoatMotionState(parked.yaw);
          mountBoat();
          body.setTranslation(
            {
              x: parked.parked[0],
              y: LAKE_LEVEL + BOAT_TUNING.rideHeight,
              z: parked.parked[2],
            },
            true,
          );
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setGravityScale(0, true);
          swimmingRef.current = false;
          setSwimming(false);
          setBoating(true);
          keys.current.clear();
          jumpRequest.current = false;
          jumpState.current = initialJumpMotion();
          return;
        }
      }
      if (
        e.code === "KeyV" &&
        !indoors &&
        !e.repeat &&
        mode === "walk" &&
        !paused &&
        !swimmingRef.current &&
        !getBoatState().mounted &&
        getActivityPose().kind === "none"
      ) {
        const body = controller.current?.body;
        if (!body || !controller.current?.isOnGround) return;
        e.preventDefault();
        if (getVehicleState().mounted) {
          const pos = body.translation(),
            floor = scooterSupportHeight(world, pos.x, pos.z, pos.y, body);
          if (floor === undefined) return;
          parkVehicle([pos.x, floor, pos.z], rideYaw.current);
          const sideX = pos.x + Math.cos(rideYaw.current) * 0.65,
            sideZ = pos.z - Math.sin(rideYaw.current) * 0.65;
          const sideFloor = scooterSupportHeight(
            world,
            sideX,
            sideZ,
            pos.y + 0.25,
            body,
          );
          if (
            !inWater(sideX, sideZ) &&
            sideFloor !== undefined &&
            Math.abs(sideFloor - floor) < 0.7
          )
            body.setTranslation(
              { x: sideX, y: sideFloor + 0.95, z: sideZ },
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
              y: parked.parked[1] + 0.95,
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
      if (
        e.code === "KeyQ" &&
        !e.repeat &&
        mode === "walk" &&
        !paused &&
        !indoors &&
        !swimmingRef.current &&
        !getVehicleState().mounted &&
        !getBoatState().mounted &&
        getActivityPose().kind === "none" &&
        controller.current?.isOnGround
      ) {
        const room = currentMultiplayerRoom();
        if (
          room &&
          visual.current &&
          !room.stunned(room.getSnapshot().selfId)
        ) {
          const feet = visual.current.getWorldPosition(new THREE.Vector3());
          const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(
            visual.current.getWorldQuaternion(new THREE.Quaternion()),
          );
          room.punch(feet.toArray(), Math.atan2(facing.x, facing.z));
        }
        e.preventDefault();
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
  }, [mode, paused, mixer, indoors]);
  useEffect(() => {
    controller.current?.body?.setTranslation(
      {
        x: arrival.position[0],
        y: arrival.position[1] + 0.98,
        z: arrival.position[2],
      },
      true,
    );
    controller.current?.body?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    controller.current?.body?.setGravityScale(1, true);
    swimmingRef.current = false;
    setSwimming(false);
    waterSample.current.elapsed = 1;
    dryScooter.current = null;
    doorArrival.current = null;
    controller.current?.body?.setBodyType(rapier.RigidBodyType.Dynamic, true);
    playerPosition.set(
      arrival.position[0],
      arrival.position[1] + 0.98,
      arrival.position[2],
    );
    playerViewPosition.copy(playerPosition);
    rideYaw.current = arrival.yaw;
    if (visual.current) {
      visual.current.parent?.getWorldQuaternion(facingParent);
      localFacing(arrival.yaw, facingParent, facingTarget);
      visual.current.quaternion.copy(facingTarget);
    }
    keys.current.clear();
    jumpRequest.current = false;
    jumpState.current = initialJumpMotion();
    setJumping(false);
    riderRig.current?.reset();
    boatRider.current?.reset();
    mixer.stopAllAction();
    animation.current = "";
    setRiding(false);
    setBoating(false);
    parkVehicle(arrival.scooter, arrival.yaw);
    resetBoatToDock(arrival.position[0]);
    parkedGrounded.current = false;
    onMotion({
      homeIndex,
      position: playerPosition.toArray(),
      feet: [
        arrival.position[0],
        arrival.position[1] + 0.015,
        arrival.position[2],
      ],
      facing: [Math.sin(arrival.yaw), 0, Math.cos(arrival.yaw)],
      animation: "Idle_Neutral",
      activity: "none",
      velocity: [0, 0, 0],
      jumpPhase: "grounded",
      vehicle: null,
      grounded: true,
    });
  }, [resetKey, arrival]);
  useFrame((_, dt) => {
    const c = controller.current;
    if (!c || !c.body) return;
    const requestedTransfer = takeCabinTransfer();
    if (requestedTransfer) {
      doorArrival.current = requestedTransfer;
      doorArrivalStarted.current = performance.now();
      const bodyPosition = c.body.translation();
      if (
        requestedTransfer.from &&
        Math.hypot(
          bodyPosition.x - requestedTransfer.from[0],
          bodyPosition.z - requestedTransfer.from[2],
        ) < 2.3
      ) {
        requestedTransfer.from = [
          bodyPosition.x,
          requestedTransfer.position[1],
          bodyPosition.z,
        ];
      }
    }
    const transfer = doorArrival.current;
    if (transfer && (requestedTransfer || doorTransition)) {
      c.body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      const doorMotion = sampleCabinMotion(
        transfer,
        (performance.now() - doorArrivalStarted.current) / 1000,
      );
      const arrivalPosition = doorMotion.position;
      c.body.setTranslation(
        {
          x: arrivalPosition[0],
          y: arrivalPosition[1],
          z: arrivalPosition[2],
        },
        true,
      );
      c.body.setNextKinematicTranslation({
        x: arrivalPosition[0],
        y: arrivalPosition[1],
        z: arrivalPosition[2],
      });
      c.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      c.body.resetForces(true);
      c.body.resetTorques(true);
      keys.current.clear();
      c.setMovement({
        forward: false,
        backward: false,
        leftward: false,
        rightward: false,
        run: false,
        jump: false,
      });
      playerPosition.set(...arrivalPosition);
      playerViewPosition.set(...arrivalPosition);
      if (visual.current) {
        visual.current.parent?.getWorldQuaternion(facingParent);
        localFacing(transfer.facing, facingParent, facingTarget);
        visual.current.quaternion.copy(facingTarget);
      }
      if (visual.current) visual.current.position.y = cabinSoleOffset;
      jumpState.current = initialJumpMotion();
      setJumping(false);
      const doorAnimation = doorMotion.animation;
      if (requestedTransfer || animation.current !== doorAnimation) {
        actions[animation.current]?.fadeOut(0.12);
        actions[doorAnimation]?.reset().fadeIn(0.12).play();
        animation.current = doorAnimation;
      }
      // Keep peers moving during the scripted walk; normal locomotion stays bypassed.
      sampleClock.current += dt;
      if (sampleClock.current > 1 / 7) {
        sampleClock.current = 0;
        onMotion({
          ...doorMotion,
          homeIndex,
          animationHistory: animationHistory.current,
        });
      }
      return;
    }
    if (doorArrival.current) {
      doorArrival.current = null;
      c.body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      c.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      c.body.resetForces(true);
      c.body.resetTorques(true);
    }
    const k = keys.current;
    let mounted = getVehicleState().mounted;
    const boatingNow = getBoatState().mounted;
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
    const room = currentMultiplayerRoom();
    const selfId = room?.getSnapshot().selfId ?? "";
    const stunned = Boolean(room?.stunned(selfId));
    const punching = Boolean(room?.punching(selfId));
    if (stunned) {
      keys.current.clear();
      jumpRequest.current = false;
      const v = c.body.linvel();
      c.body.setLinvel({ x: 0, y: v.y, z: 0 }, true);
    }
    const active = mode === "walk" && !paused && !holding && !stunned;
    const p = c.body.translation();
    const sample = waterSample.current;
    sample.elapsed += dt;
    let sampled = false;
    const movedSquared = (p.x - sample.x) ** 2 + (p.z - sample.z) ** 2;
    if (
      sample.indoors !== indoors ||
      movedSquared > 0.09 ||
      (sample.elapsed >= 0.1 && movedSquared > 0.0001)
    ) {
      sample.elapsed = 0;
      sample.x = p.x;
      sample.z = p.z;
      sample.indoors = indoors;
      sample.wet = !indoors && inWater(p.x, p.z);
      sample.ground = sample.wet ? terrainHeight(p.x, p.z, undefined, true) : 0;
      sampled = true;
    }
    // A scooter stays on the last dry ground when its rider enters the lake.
    if (mounted && sampled && !sample.wet && c.isOnGround)
      dryScooter.current = { x: p.x, z: p.z, bodyY: p.y, yaw: rideYaw.current };
    if (mounted && sample.wet && p.y < LAKE_LEVEL + 1.4) {
      const dry = dryScooter.current ?? {
        x: arrival.scooter[0],
        z: arrival.scooter[2],
        bodyY: arrival.scooter[1] + 2,
        yaw: arrival.yaw,
      };
      const support =
        scooterSupportHeight(world, dry.x, dry.z, dry.bodyY, c.body) ??
        floorAt(dry.x, dry.z);
      parkVehicle([dry.x, support, dry.z], dry.yaw);
      const velocity = c.body.linvel();
      const horizontal = Math.hypot(velocity.x, velocity.z);
      const scale = horizontal > 3.5 ? 3.5 / horizontal : 1;
      c.body.setLinvel(
        { x: velocity.x * scale, y: velocity.y, z: velocity.z * scale },
        true,
      );
      riderRig.current?.reset();
      mixer.stopAllAction();
      animation.current = "";
      setRiding(false);
      mounted = false;
    }
    const nowSwimming = swimmingState({
      swimming: swimmingRef.current,
      inLake: sample.wet,
      depth: LAKE_LEVEL - sample.ground,
      bodyY: p.y,
      indoors,
      occupied: holding || mounted || boatingNow,
    });
    if (nowSwimming !== swimmingRef.current) {
      swimmingRef.current = nowSwimming;
      setSwimming(nowSwimming);
      c.body.setGravityScale(nowSwimming ? 0 : 1, true);
      jumpState.current = initialJumpMotion();
      jumpRequest.current = false;
    }
    const steer =
      active && mounted
        ? scooterSteeringInput(
            k.has("KeyA") || k.has("ArrowLeft"),
            k.has("KeyD") || k.has("ArrowRight"),
          )
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
    // Motorboat: commanded speed drops to what the hull achieved last step, so a
    // bank stops it; the float holds ride height with no ground clamp.
    if (boatingNow) {
      const motion = boatMotion.current;
      const v = c.body.linvel();
      motion.speed = reconcileBoatSpeed(
        motion.speed,
        v.x * Math.sin(motion.yaw) + v.z * Math.cos(motion.yaw),
      );
      const throttle = active
        ? Number(k.has("KeyW") || k.has("ArrowUp")) -
          Number(k.has("KeyS") || k.has("ArrowDown"))
        : 0;
      advanceBoat(motion, {
        throttle: throttle as -1 | 0 | 1,
        steer: active
          ? scooterSteeringInput(
              k.has("KeyA") || k.has("ArrowLeft"),
              k.has("KeyD") || k.has("ArrowRight"),
            )
          : 0,
        dt,
      });
      // Shallows or land within the probe stop the hull before it can climb a
      // bank; at rest the throttle picks the side, so a beached bow can reverse.
      const heading =
        Math.abs(motion.speed) > 1e-3
          ? Math.sign(motion.speed)
          : throttle < 0
            ? -1
            : 1;
      if (boatBlockedAhead(p.x, p.z, motion.yaw, heading as 1 | -1))
        motion.speed = 0;
      c.body.setGravityScale(0, true);
      c.body.setLinvel(
        boatVelocity({
          yaw: motion.yaw,
          speed: motion.speed,
          velocityY: v.y,
          bodyY: p.y,
          time: performance.now() / 1000,
          dt,
        }),
        true,
      );
      updateBoatMotion(motion.yaw, motion.speed);
    }
    const braking = mounted && (k.has("KeyS") || k.has("ArrowDown"));
    const walkInput = active && !boatingNow;
    const jumpStarted =
      walkInput &&
      !mounted &&
      !nowSwimming &&
      jumpRequest.current &&
      c.isOnGround;
    jumpRequest.current = false;
    jumpState.current = advanceJumpMotion(jumpState.current, {
      now: performance.now() / 1000,
      grounded: c.isOnGround,
      verticalSpeed: c.currLinVel.y,
      horizontalSpeed: Math.hypot(c.currLinVel.x, c.currLinVel.z),
      jumpStarted,
      disabled: holding || mounted || nowSwimming || boatingNow,
    });
    const airborneJump =
      jumpState.current.phase === "takeoff" ||
      jumpState.current.phase === "airborne";
    if (airborneJump !== jumping) setJumping(airborneJump);
    c.setMovement({
      forward:
        walkInput &&
        !nowSwimming &&
        !braking &&
        (k.has("KeyW") || k.has("ArrowUp")),
      backward:
        walkInput &&
        !nowSwimming &&
        !mounted &&
        (k.has("KeyS") || k.has("ArrowDown")),
      leftward:
        walkInput &&
        !nowSwimming &&
        !mounted &&
        (k.has("KeyA") || k.has("ArrowLeft")),
      rightward:
        walkInput &&
        !nowSwimming &&
        !mounted &&
        (k.has("KeyD") || k.has("ArrowRight")),
      run:
        walkInput &&
        !nowSwimming &&
        (k.has("ShiftLeft") || k.has("ShiftRight")),
      jump: walkInput && !nowSwimming && !mounted && k.has("Space"),
    });
    if (nowSwimming) {
      camera.getWorldDirection(swimForward);
      swimForward.y = 0;
      swimForward.normalize();
      swimRight.set(-swimForward.z, 0, swimForward.x);
      const forward = active
        ? Number(k.has("KeyW") || k.has("ArrowUp")) -
          Number(k.has("KeyS") || k.has("ArrowDown"))
        : 0;
      const right = active
        ? Number(k.has("KeyD") || k.has("ArrowRight")) -
          Number(k.has("KeyA") || k.has("ArrowLeft"))
        : 0;
      swimDirection
        .copy(swimForward)
        .multiplyScalar(forward)
        .addScaledVector(swimRight, right);
      c.body.setGravityScale(0, true);
      c.body.setLinvel(
        swimVelocity({
          velocity: c.body.linvel(),
          direction: swimDirection,
          bodyY: p.y,
          groundY: sample.ground,
          time: performance.now() / 1000,
          dt,
        }),
        true,
      );
    }
    const velocity = nowSwimming || boatingNow ? c.body.linvel() : c.currLinVel;
    playerPosition.set(p.x, p.y, p.z);
    if (
      !holding &&
      (p.y < -5 || Math.abs(p.x) > 2100 || Math.abs(p.z) > 1450)
    ) {
      c.body.setTranslation(
        {
          x: arrival.position[0],
          y: arrival.position[1] + 0.98,
          z: arrival.position[2],
        },
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
    const rayGroundY = ground ? p.y - ground.timeOfImpact : null;
    const contactGroundY = c.standPoint.y;
    const groundedEdge =
      c.isOnGround && p.y - contactGroundY > 0.55 && p.y - contactGroundY < 1.4;
    const groundY = holding
      ? pose.anchor![1]
      : groundedEdge &&
          (rayGroundY === null || contactGroundY - rayGroundY > 0.25)
        ? contactGroundY
        : rayGroundY;
    if (visual.current) {
      visual.current.parent?.getWorldPosition(playerViewPosition);
      const offset = boatingNow
        ? LAKE_LEVEL + BOAT_FLOAT_HEIGHT - playerViewPosition.y
        : nowSwimming
          ? SWIM_OFFSET
          : holding
            ? -0.95 + activitySeatLift(pose, elapsed)
            : c.isOnGround && groundY !== null && c.currLinVel.y < 0.8
              ? groundY - playerViewPosition.y + 0.015
              : -0.935;
      // A single sole offset through flight avoids a 13.5 cm takeoff/landing pop.
      visual.current.position.y =
        holding || boatingNow
          ? offset
          : THREE.MathUtils.damp(
              visual.current.position.y,
              offset,
              nowSwimming ? 9 : 30,
              dt,
            );
    }
    const speed = holding ? 0 : Math.hypot(velocity.x, velocity.z);
    const jumpClip = jumpAnimation(
        jumpState.current.phase,
        jumpState.current.style,
      ),
      clipConfig = activity ?? jumpClip;
    const next =
      (stunned ? "Punch_Hit" : punching ? "Punch_Jab" : undefined) ??
      activity?.name ??
      (boatingNow
        ? "Activity_Sit"
        : nowSwimming
          ? speed > 0.3
            ? "Swim_Forward"
            : "Swim_Idle"
          : mounted
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
      const blendDuration =
        jumpClip || animation.current.startsWith("Jump_") ? 0.09 : 0.14;
      actions[animation.current]?.fadeOut(blendDuration);
      const action = actions[next];
      if (action) {
        action.reset();
        if (next === "Run" && animation.current === "Jump_RunLand")
          action.time = action.getClip().duration * 0.64;
        action.setLoop(
          next === "Punch_Jab" ||
            next === "Punch_Hit" ||
            (clipConfig && !clipConfig.loop)
            ? THREE.LoopOnce
            : THREE.LoopRepeat,
          Infinity,
        );
        action.clampWhenFinished = Boolean(
          next === "Punch_Jab" ||
          next === "Punch_Hit" ||
          (clipConfig && !clipConfig.loop),
        );
        action.setEffectiveTimeScale(
          clipConfig ? action.getClip().duration / clipConfig.duration : 1,
        );
        action.fadeIn(blendDuration).play();
      }
      animation.current = next;
      lastActivityStart.current = pose.startedAt;
    }
    if (visual.current) {
      const angle = holding
        ? pose.facing
        : boatingNow
          ? boatMotion.current.yaw
          : mounted
            ? rideYaw.current
            : speed > 0.3
              ? Math.atan2(velocity.x, velocity.z)
              : undefined;
      if (angle !== undefined) {
        visual.current.parent?.getWorldQuaternion(facingParent);
        localFacing(angle, facingParent, facingTarget);
        if (holding || boatingNow) visual.current.quaternion.copy(facingTarget);
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
    if (visual.current?.parent)
      visual.current.parent.getWorldPosition(playerViewPosition);
    else playerViewPosition.copy(playerPosition);
    activityRig.current?.update(pose, elapsed);
    if (pose.kind === "sit" || pose.kind === "sit-down") {
      const room = currentMultiplayerRoom();
      if (room && planesSeatSide(room.ownSeatId()) !== null)
        tableReaction.update(
          room.planesReaction(room.getSnapshot().selfId),
          performance.now(),
        );
    }
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
    // After the mixer: turn the wheel, then pin both hands to its grips.
    if (boatingNow && boat.current) {
      const { wheelAngle, lean } = boatMotion.current;
      boat.current.update({ wheelAngle, lean });
      boatRider.current?.update({
        left: boat.current.gripWorldPosition("left", leftGrip),
        right: boat.current.gripWorldPosition("right", rightGrip),
      });
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
          (facing.x * velocity.x + facing.z * velocity.z) / speed;
      const near =
        !indoors &&
        mode === "walk" &&
        !paused &&
        !mounted &&
        !boatingNow &&
        !nowSwimming &&
        Math.hypot(
          p.x - getVehicleState().parked[0],
          p.z - getVehicleState().parked[2],
        ) <= 3.5;
      if (near !== nearScooter.current) {
        nearScooter.current = near;
        onVehicleHint?.(near);
      }
      // Boarding is allowed from the water, so swimming still shows the hint.
      const boatNear =
        !indoors &&
        mode === "walk" &&
        !paused &&
        !mounted &&
        !boatingNow &&
        Math.hypot(
          p.x - getBoatState().parked[0],
          p.z - getBoatState().parked[2],
        ) <= BOAT_BOARD_DISTANCE;
      if (boatNear !== nearBoat.current) {
        nearBoat.current = boatNear;
        onBoatHint?.(boatNear);
      }
      onMotion({
        homeIndex,
        vehicle: boatingNow ? "Motorboat" : mounted ? "QuickVolt 9" : null,
        vehicleSpeed: boatingNow
          ? getBoatState().speed
          : mounted
            ? getVehicleState().speed
            : 0,
        jumpPhase: jumpState.current.phase,
        jumpStyle: jumpState.current.style,
        animationHistory: animationHistory.current,
        position: [p.x, p.y, p.z],
        feet: feet.toArray(),
        contact: c.standPoint.toArray(),
        grounded: !boatingNow && (holding || (!nowSwimming && c.isOnGround)),
        activity: pose.kind,
        animation: next,
        groundY,
        velocity: [velocity.x, velocity.y, velocity.z],
        facing: facing.toArray(),
        inWater: inWater(p.x, p.z),
        ...(import.meta.env.DEV || import.meta.env.VITE_GAME_DIAGNOSTICS === "1"
          ? {
              pressedKeys: [...k],
              cameraDirection: camera
                .getWorldDirection(new THREE.Vector3())
                .toArray(),
            }
          : {}),
        lastMovingAlignment: lastMovingAlignment.current,
        facingDot:
          speed > 0.3
            ? (facing.x * velocity.x + facing.z * velocity.z) / speed
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
      enable={!swimming && !boating}
      position={[
        arrival.position[0],
        arrival.position[1] + 0.98,
        arrival.position[2],
      ]}
      enabledRotations={[false, false, false]}
      autoBalance={false}
      enableToggleRun={false}
      capsuleHalfHeight={0.35}
      capsuleRadius={0.3}
      ccd
      useCustomForward={riding}
      maxWalkVel={riding ? scooterSpeed.cruise : 3.8}
      maxRunVel={riding ? scooterSpeed.boost : 6.5}
      jumpVel={7.4}
      friction={1.2}
      restitution={0}
      slideGripFactor={1.1}
      decDeltaTime={0.3}
      slopeMaxAngle={Math.PI * 0.4}
      rayRadius={0.22}
      rayHitForgiveness={jumping ? 0.05 : 0.28}
      floatHeight={0.3}
    >
      <group ref={visual} position={[0, -0.9, 0]}>
        <primitive object={object} dispose={null} />
        <StunStars room={currentMultiplayerRoom()} />
        <Scooter ref={scooter} visible={riding} />
        <Boat ref={boat} visible={boating} />
      </group>
      {swimming && <SwimWake />}
      {boating && <SwimWake scale={2.6} />}
    </Ecctrl>
  );
}
export function CameraRig({
  mode,
  resetKey,
  homeIndex = 18,
  interiorIndex = null,
  onFocusCabin,
  transitioning = false,
  tableSeat = null,
}: {
  mode: ViewMode;
  resetKey: number;
  homeIndex?: number;
  interiorIndex?: number | null;
  onFocusCabin?: (index: number) => void;
  transitioning?: boolean;
  tableSeat?: 0 | 1 | null;
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
  const { camera, gl, events } = useThree();
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const element =
      c.domElement ??
      (events.connected as HTMLElement | undefined) ??
      gl.domElement;
    return bindCameraMouse(c, element);
  }, [gl, events.connected]);
  const last = useRef(new THREE.Vector3());
  const priorInterior = useRef<number | null>(null);
  const priorTable = useRef<number | null>(null);
  const blend = useRef<{
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromTarget: THREE.Vector3;
    target: THREE.Vector3;
    elapsed: number;
  } | null>(null);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const from = camera.position.clone(),
      fromTarget = c.target.clone();
    const leaving = priorInterior.current !== null && interiorIndex === null;
    const changingRoom = priorInterior.current !== interiorIndex;
    const exitedIndex = priorInterior.current;
    const changingTable = priorTable.current !== tableSeat;
    priorTable.current = tableSeat;
    priorInterior.current = interiorIndex;
    if (tableSeat !== null) {
      // Keep the seated pair in the clear space to the left of the paper.
      const panZ = tableSeat === 0 ? 0.82 : -0.82;
      camera.position.set(
        PLANES_TABLE.x + (tableSeat === 0 ? -3.4 : 3.4) + 0.55,
        PLANES_TABLE.ground + 2.1,
        PLANES_TABLE.z + 2.3 + panZ,
      );
      c.target.set(
        PLANES_TABLE.x + 0.55,
        PLANES_TABLE.ground + 1,
        PLANES_TABLE.z + panZ,
      );
    } else if (interiorIndex !== null) {
      const plot = cabinSpots[interiorIndex],
        yaw = cabinYaw(interiorIndex),
        x = 6.2,
        z = 8.1;
      camera.position.set(
        plot.x + x * Math.cos(yaw) + z * Math.sin(yaw),
        plot.ground + interiorFloorOffset + 7.0,
        plot.z - x * Math.sin(yaw) + z * Math.cos(yaw),
      );
      c.target.set(plot.x, plot.ground + interiorFloorOffset + 0.8, plot.z);
    } else if (leaving && exitedIndex !== null) {
      const exit = cabinTransfer(exitedIndex, false),
        yaw = cabinYaw(exitedIndex);
      const p = new THREE.Vector3(...exit.position);
      camera.position
        .copy(p)
        .add(
          new THREE.Vector3(
            5 * Math.cos(yaw) + 7 * Math.sin(yaw),
            3.4,
            -5 * Math.sin(yaw) + 7 * Math.cos(yaw),
          ),
        );
      c.target.copy(p).add(new THREE.Vector3(0, 0.65, 0));
    } else if (mode === "overview") {
      camera.position.set(390, 290, southShore(0) + 500);
      c.target.set(0, 10, southShore(0) + 80);
    } else if (mode === "home") {
      const plot = cabinSpots[homeIndex];
      onFocusCabin?.(plot.i);
      camera.position.set(plot.x + 10, plot.ground + 8, plot.z - 16);
      c.target.set(plot.x, plot.ground + 2, plot.z);
    } else if (mode === "settlement") {
      const desired = cabinDesigns[cabinVariant];
      const plot =
        cabinSpots.find((p) => cabinDesignForPlot(p.i).key === desired.key) ??
        cabinSpots[18];
      camera.position.set(plot.x + 8, plot.ground + 7, plot.z - 13);
      c.target.set(plot.x, plot.ground + 2, plot.z);
      onFocusCabin?.(plot.i);
    } else if (mode === "study") {
      camera.position
        .copy(playerViewPosition)
        .add(new THREE.Vector3(4, 1.4, 5));
      c.target.copy(playerViewPosition).add(new THREE.Vector3(0, 0.1, 0));
    } else {
      camera.position
        .copy(playerViewPosition)
        .add(new THREE.Vector3(...homeWalkCameraOffset(homeIndex)));
      c.target.copy(playerViewPosition).add(new THREE.Vector3(0, 0.8, 0));
    }
    if (changingRoom || changingTable) {
      blend.current = {
        from,
        fromTarget,
        to: camera.position.clone(),
        target: c.target.clone(),
        elapsed: 0,
      };
      camera.position.copy(from);
      c.target.copy(fromTarget);
    }
    last.current.copy(playerViewPosition);
    c.update();
  }, [
    mode,
    camera,
    resetKey,
    cabinVariant,
    homeIndex,
    interiorIndex,
    onFocusCabin,
    tableSeat,
  ]);
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const transition = blend.current;
    if (transition) {
      transition.elapsed += Math.min(dt, 0.05);
      const t = Math.min(1, transition.elapsed / 0.8),
        eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(transition.from, transition.to, eased);
      c.target.lerpVectors(transition.fromTarget, transition.target, eased);
      c.update();
      last.current.copy(playerViewPosition);
      if (t === 1) blend.current = null;
      return;
    }
    if (
      tableSeat === null &&
      interiorIndex === null &&
      (mode === "walk" || mode === "study")
    ) {
      const delta = playerViewPosition.clone().sub(last.current);
      camera.position.add(delta);
      c.target
        .copy(playerViewPosition)
        .add(new THREE.Vector3(0, mode === "study" ? 0.1 : 0.65, 0));
      last.current.copy(playerViewPosition);
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!transitioning}
      enablePan={
        tableSeat === null &&
        interiorIndex === null &&
        (mode === "overview" || mode === "settlement" || mode === "home")
      }
      minDistance={
        tableSeat !== null
          ? 2
          : interiorIndex !== null
            ? 9
            : mode === "overview" || mode === "settlement" || mode === "home"
              ? 8
              : 2.5
      }
      maxDistance={
        tableSeat !== null
          ? 6
          : interiorIndex !== null
            ? 18
            : mode === "overview" || mode === "settlement" || mode === "home"
              ? 1600
              : 22
      }
      maxPolarAngle={Math.PI * 0.47}
      minPolarAngle={0.15}
      enableDamping={mode !== "walk" && mode !== "study"}
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
