import {
  BOAT_MAX_SPEED,
  solveBoatContactIsland,
  integrateBoat,
  wrapBoatYaw,
  quantizeBoatPose,
  type BoatBody,
} from "../../packages/shared/boats";
import type {
  PlayerPresence,
  ServerMessage,
} from "../../packages/shared/protocol";
import type { RoomConnection, SessionState } from "./room-core";

function body(player: PlayerPresence): BoatBody | null {
  if (!player.boat || player.boatImpactRevision === undefined) return null;
  return {
    ...player.boat,
    moored: player.vehicle !== "boat",
    rotationLocked: player.boat.angularVelocity === undefined,
  };
}
function apply(connection: RoomConnection, boat: BoatBody, now: number) {
  const state = connection.state!;
  const mounted = state.player.vehicle === "boat";
  const revision = (state.player.boatImpactRevision ?? 0) + (mounted ? 1 : 0);
  const { moored: _moored, rotationLocked: _locked, ...rawPose } = boat;
  const pose = quantizeBoatPose(rawPose);
  const player: PlayerPresence = {
    ...state.player,
    boat: pose,
    boatImpactRevision: revision,
  };
  if (mounted) {
    player.position = [pose.position[0], player.position[1], pose.position[1]];
    player.yaw = pose.yaw;
    player.speed =
      pose.velocity[0] * Math.sin(pose.yaw) +
      pose.velocity[1] * Math.cos(pose.yaw);
  }
  connection.setState({ ...state, player, boatPoseAt: now });
  if (mounted) {
    const message: ServerMessage = {
      type: "boat-impact",
      revision,
      boat: pose,
    };
    connection.send(JSON.stringify(message));
  }
}
/** Pair impacts are derived from accepted poses; clients cannot request impulses. */
export function resolveRoomBoatCollision(
  driver: RoomConnection,
  previous: Readonly<SessionState>,
  connections: RoomConnection[],
  now: number,
) {
  const current = driver.state!;
  const fromA = body(previous.player),
    toA = body(current.player);
  if (
    !fromA ||
    !toA ||
    current.nameAt === undefined ||
    previous.boatPoseAt === undefined
  )
    return;
  const elapsed = now - previous.boatPoseAt;
  const seconds = elapsed > 0 ? elapsed / 1000 : 0.15;
  const distance = Math.hypot(
    toA.position[0] - fromA.position[0],
    toA.position[1] - fromA.position[1],
  );
  // Resets/teleports and stale connections cannot sweep across the world and
  // knock unrelated boats. Ordinary driving remains below this generous bound.
  // Bursts may contain sequential poses received in the same millisecond.
  // Give them one normal pose interval, without allowing a long teleport.
  if (
    elapsed < 0 ||
    elapsed > 1000 ||
    distance > BOAT_MAX_SPEED * Math.max(elapsed / 1000, 0.15) + 0.5
  )
    return;
  const members = [driver],
    sources = [fromA],
    targets = [toA];
  for (const other of connections) {
    const s = other.state;
    if (
      other === driver ||
      !s ||
      s.nameAt === undefined ||
      (current.home && s.home?.index === current.home.index)
    )
      continue;
    const old = body(s.player);
    if (!old) continue;
    const age = now - (s.boatPoseAt ?? now);
    if (
      !old.moored &&
      (Math.hypot(...old.velocity) > 0.1 ||
        Math.abs(old.angularVelocity ?? 0) > 0.01) &&
      age > 2000
    )
      continue;
    const predict = old.moored ? 0 : Math.min(Math.max(0, age) / 1000, 0.2);
    const target = integrateBoat(old, predict);
    const source: BoatBody = {
      ...target,
      position: [
        target.position[0] - (old.moored ? 0 : old.velocity[0] * seconds),
        target.position[1] - (old.moored ? 0 : old.velocity[1] * seconds),
      ],
      yaw: wrapBoatYaw(
        target.yaw - (old.moored ? 0 : (old.angularVelocity ?? 0) * seconds),
      ),
    };
    members.push(other);
    sources.push(source);
    targets.push(target);
  }
  const result = solveBoatContactIsland(sources, targets, seconds, 0);
  const changed = [...result.changed].filter((i) => !result.bodies[i].moored);
  for (const index of changed) apply(members[index], result.bodies[index], now);
  // One final correction per affected owner; intermediate manifold iterations
  // never become network packets. The initiating pose is broadcast by RoomCore.
  for (const index of changed) {
    if (index === 0) continue;
    const message = JSON.stringify({
      type: "pose",
      player: members[index].state!.player,
    } satisfies ServerMessage);
    for (const c of connections) if (c !== members[index]) c.send(message);
  }
}
