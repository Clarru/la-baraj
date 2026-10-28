import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  cloneCharacter,
  characterClips,
  disposeCharacterSkeletons,
} from "./character-resources";
import { assetUrl } from "./assets";
import {
  activityAnimation,
  createCharacterActivityRig,
} from "./character-actions";
import type { ActivityKind } from "./activity-state";
import { jumpAnimation, type JumpPhase } from "./locomotion-animation";
import { createScooterRiderRig } from "./scooter-rider";
import type { ScooterHandle } from "./scooter";
import { RemoteScooter, RemoteScooterFleet } from "./RemoteScooterFleet";
import type { MultiplayerRoom } from "./multiplayer";
import { createTableReactionRig } from "./table-reactions";
import { planesSeatSide } from "../../../packages/shared/planes-station";

/** Membership alone reconciles React. Pose packets update mutable targets read by each rig. */
export function MultiplayerPlayers({ room }: { room: MultiplayerRoom }) {
  const { ids } = useSyncExternalStore(room.subscribe, room.getSnapshot);
  if (!ids.length) return null;
  return (
    <RemoteScooterFleet>
      {ids.map((id) => (
        <RemoteAvatar key={id} id={id} room={room} />
      ))}
    </RemoteScooterFleet>
  );
}
export function RemoteAvatar({
  id,
  room,
}: {
  id: string;
  room: Pick<MultiplayerRoom, "remotes">;
}) {
  const [near, setNear] = useState(false);
  const mounted = useRef(false);
  useFrame(({ camera }) => {
    const player = room.remotes.get(id)?.player;
    const limit = mounted.current ? 250 : 220;
    const next = Boolean(
      player &&
      player.animation !== "idle" &&
      (camera.position.x - player.position[0]) ** 2 +
        (camera.position.y - player.position[1]) ** 2 +
        (camera.position.z - player.position[2]) ** 2 <
        limit * limit,
    );
    if (next !== mounted.current) {
      mounted.current = next;
      setNear(next);
    }
  }, -5);
  return near ? <RemoteAvatarRig id={id} room={room} /> : null;
}
function RemoteAvatarRig({
  id,
  room,
}: {
  id: string;
  room: Pick<MultiplayerRoom, "remotes">;
}) {
  const { scene, animations } = useGLTF(assetUrl("Lakeside_Man"));
  const supplemental = useLoader(
    THREE.FileLoader,
    "/assets/animations/character-actions.json",
  );
  const object = useMemo(() => cloneCharacter(scene), [scene]);
  const tableReaction = useMemo(() => createTableReactionRig(object), [object]);
  useEffect(() => () => tableReaction.dispose(), [tableReaction]);
  const clips = useMemo(() => {
    return characterClips(animations, String(supplemental));
  }, [animations, supplemental]);
  const rig = useMemo(() => {
    const mixer = new THREE.AnimationMixer(object);
    return {
      mixer,
      actions: new Map(
        clips.map((clip) => [clip.name, mixer.clipAction(clip)]),
      ),
    };
  }, [object, clips, animations]);
  const helpers = useRef<{
    rider: ReturnType<typeof createScooterRiderRig>;
    activity: ReturnType<typeof createCharacterActivityRig>;
  } | null>(null);
  const root = useRef<THREE.Group>(null),
    scooterGroup = useRef<THREE.Group>(null),
    scooter = useRef<ScooterHandle>(null);
  const [hasScooter, setHasScooter] = useState(false);
  const scooterMounted = useRef(false);
  const target = useMemo(() => new THREE.Vector3(), []);
  const previousAnimation = useRef(""),
    previousActivityAt = useRef(-1),
    previousGesture = useRef<string | null>(null),
    wasRiding = useRef(false),
    initialized = useRef(false);
  const badge = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const runtime = {
      rider: createScooterRiderRig(
        object,
        animations.find((clip) => clip.name === "Idle_Neutral"),
      ),
      activity: createCharacterActivityRig(object),
    };
    helpers.current = runtime;
    return () => {
      rig.mixer.stopAllAction();
      rig.mixer.uncacheRoot(object);
      disposeCharacterSkeletons(object);
      runtime.rider.dispose();
      runtime.activity.dispose();
      helpers.current = null;
    };
  }, [rig, object, animations]);
  useFrame((_, delta) => {
    tableReaction.beginFrame();
    const remote = room.remotes.get(id),
      group = root.current;
    if (!remote || !group) return;
    const player = remote.player,
      dt = Math.min(delta, 0.1),
      riding = player.vehicle === "scooter";
    target.fromArray(player.position);
    // Presence still arrives; distant rigs need neither bone/IK updates nor badges.
    const visible = player.animation !== "idle";
    group.visible = visible;
    if (badge.current) badge.current.style.display = visible ? "" : "none";
    if (!visible) {
      initialized.current = false;
      return;
    }
    if (scooterMounted.current !== riding) {
      scooterMounted.current = riding;
      setHasScooter(riding);
    }
    if (
      !initialized.current ||
      group.position.distanceToSquared(target) > 100
    ) {
      group.position.copy(target);
      group.rotation.y = player.yaw;
      initialized.current = true;
    } else {
      group.position.lerp(target, 1 - Math.exp(-16 * dt));
      const turn = Math.atan2(
        Math.sin(player.yaw - group.rotation.y),
        Math.cos(player.yaw - group.rotation.y),
      );
      group.rotation.y += turn * (1 - Math.exp(-18 * dt));
    }
    if (wasRiding.current && !riding) helpers.current?.rider.reset();
    const activity = activityAnimation(player.activity as ActivityKind),
      jump = jumpAnimation(
        player.jumpPhase as JumpPhase,
        player.animation.startsWith("Jump_Run") ? "run" : "walk",
      );
    const config = activity ?? jump;
    const next = rig.actions.has(player.animation)
      ? player.animation
      : "Idle_Neutral";
    if (
      next !== previousAnimation.current ||
      (activity && remote.activityAt !== previousActivityAt.current)
    ) {
      const blendDuration =
        jump || previousAnimation.current.startsWith("Jump_") ? 0.09 : 0.14;
      rig.actions.get(previousAnimation.current)?.fadeOut(blendDuration);
      const action = rig.actions.get(next);
      if (action) {
        action
          .reset()
          .setLoop(
            config && !config.loop ? THREE.LoopOnce : THREE.LoopRepeat,
            Infinity,
          );
        if (next === "Run" && previousAnimation.current === "Jump_RunLand")
          action.time = action.getClip().duration * 0.64;
        action.clampWhenFinished = Boolean(config && !config.loop);
        action
          .setEffectiveTimeScale(
            config ? action.getClip().duration / config.duration : 1,
          )
          .fadeIn(blendDuration)
          .play();
      }
      previousAnimation.current = next;
      previousActivityAt.current = remote.activityAt;
    }
    const gesture =
      player.activity === "reel"
        ? "Activity_ReelGesture"
        : player.activity === "bite"
          ? "Activity_BiteGesture"
          : null;
    if (gesture !== previousGesture.current) {
      if (previousGesture.current)
        rig.actions.get(previousGesture.current)?.fadeOut(0.12);
      if (gesture) rig.actions.get(gesture)?.reset().fadeIn(0.12).play();
      previousGesture.current = gesture;
    }
    rig.mixer.update(dt);
    helpers.current?.activity.update(
      { kind: player.activity as ActivityKind, startedAt: remote.activityAt },
      (performance.now() - remote.activityAt) / 1000,
    );
    if (scooterGroup.current) scooterGroup.current.visible = riding;
    if (riding) {
      scooter.current?.update({ speed: player.speed ?? 0, steer: 0, dt });
      helpers.current?.rider.update({ speed: player.speed ?? 0, steer: 0 });
    }
    wasRiding.current = riding;
    if (planesSeatSide(player.seatId) !== null && "planesReaction" in room)
      tableReaction.update(
        (room as MultiplayerRoom).planesReaction(id),
        performance.now(),
      );
    // This DOM is an authored diagnostic surface for automated and manual multiplayer checks.
    if (import.meta.env.DEV || import.meta.env.VITE_GAME_DIAGNOSTICS === "1") {
      badge.current?.setAttribute("data-animation", next);
      badge.current?.setAttribute("data-activity", player.activity);
      badge.current?.setAttribute("data-vehicle", player.vehicle);
    }
  }, -1);
  const player = room.remotes.get(id)?.player;
  return (
    <group ref={root} name={`Online player ${id}`}>
      <primitive object={object} dispose={null} />
      {hasScooter && (
        <group ref={scooterGroup}>
          <RemoteScooter ref={scooter} />
        </group>
      )}
      <Html
        center
        position={[0, 2.15, 0]}
        distanceFactor={planesSeatSide(player?.seatId) !== null ? 5 : 12}
        zIndexRange={[5, 0]}
        style={{ pointerEvents: "none" }}
      >
        <span ref={badge} className="multiplayer-name" data-player-id={id}>
          {player?.nickname ?? "Friend"}
        </span>
      </Html>
    </group>
  );
}
