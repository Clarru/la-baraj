import { Suspense, useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  ConvexHullCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import * as THREE from "three";
import { Boat } from "./boat";
import { PARKED_BOAT_VERTICES, setRemoteBoatCollision } from "./boat-collision";
import { LAKE_LEVEL } from "./swim-motion";
import type { MultiplayerRoom } from "./multiplayer";

/** Parked boats belong to presence, independently of the owner's avatar position. */
export function RemoteMooredBoat({
  id,
  room,
}: {
  id: string;
  room: MultiplayerRoom;
}) {
  const body = useRef<RapierRigidBody>(null),
    visual = useRef<THREE.Group>(null),
    collisionState = useRef<{
      body: RapierRigidBody;
      enabled: boolean;
      colliders: number;
    } | null>(null);
  useLayoutEffect(() => {
    collisionState.current = null;
    if (body.current) setRemoteBoatCollision(body.current, false);
  }, []);
  useFrame(({ camera }) => {
    const player = room.remotes.get(id)?.player,
      boat = player?.boat;
    const home = room.getSnapshot().homeIndex;
    const visible = Boolean(
      boat &&
      player?.vehicle !== "boat" &&
      !(home !== null && player?.homeIndex === home) &&
      Math.hypot(
        camera.position.x - boat.position[0],
        camera.position.z - boat.position[1],
      ) < 220,
    );
    if (visual.current) visual.current.visible = visible;
    if (!body.current) return;
    const colliders = body.current.numColliders();
    if (
      collisionState.current?.body !== body.current ||
      collisionState.current?.enabled !== visible ||
      collisionState.current?.colliders !== colliders
    ) {
      setRemoteBoatCollision(body.current, visible);
      collisionState.current = {
        body: body.current,
        enabled: visible,
        colliders,
      };
    }
    if (visible && boat) {
      body.current.setTranslation(
        { x: boat.position[0], y: LAKE_LEVEL, z: boat.position[1] },
        true,
      );
      body.current.setRotation(
        { x: 0, y: Math.sin(boat.yaw / 2), z: 0, w: Math.cos(boat.yaw / 2) },
        true,
      );
    }
  });
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      userData={{ remoteBoat: true }}
    >
      <ConvexHullCollider args={[PARKED_BOAT_VERTICES]} />
      <group ref={visual} visible={false}>
        <Suspense fallback={null}>
          <Boat detail="lod" />
        </Suspense>
      </group>
    </RigidBody>
  );
}
