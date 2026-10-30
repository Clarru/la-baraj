import {
  BOAT_MAX_SPEED,
  sweepBoatImpact,
  type BoatBody,
} from "../../packages/shared/boats";
import type {
  PlayerPresence,
  ServerMessage,
} from "../../packages/shared/protocol";
import type { RoomConnection, SessionState } from "./room-core";

function body(player: PlayerPresence): BoatBody | null {
  if (!player.boat || player.boatImpactRevision === undefined) return null;
  return { ...player.boat, moored: player.vehicle !== "boat" };
}
function apply(connection: RoomConnection, boat: BoatBody, now: number) {
  const state = connection.state!;
  const mounted = state.player.vehicle === "boat";
  const revision = (state.player.boatImpactRevision ?? 0) + (mounted ? 1 : 0);
  const { moored: _moored, ...pose } = boat;
  const player: PlayerPresence = {
    ...state.player,
    boat: pose,
    boatImpactRevision: revision,
  };
  if (mounted) {
    player.position = [boat.position[0], player.position[1], boat.position[1]];
    player.yaw = boat.yaw;
    player.speed =
      boat.velocity[0] * Math.sin(boat.yaw) +
      boat.velocity[1] * Math.cos(boat.yaw);
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
  let best: {
    other: RoomConnection;
    hit: NonNullable<ReturnType<typeof sweepBoatImpact>>;
  } | null = null;
  for (const other of connections) {
    const s = other.state;
    if (
      other === driver ||
      !s ||
      s.nameAt === undefined ||
      (current.home && s.home?.index === current.home.index)
    )
      continue;
    const fromB = body(s.player);
    if (!fromB || (toA.moored && fromB.moored)) continue;
    const age = now - (s.boatPoseAt ?? now);
    if (!fromB.moored && Math.hypot(...fromB.velocity) > 0.1 && age > 2000)
      continue;
    const predict = fromB.moored ? 0 : Math.min(Math.max(0, age) / 1000, 0.2);
    const toB: BoatBody = {
      ...fromB,
      position: [
        fromB.position[0] + fromB.velocity[0] * predict,
        fromB.position[1] + fromB.velocity[1] * predict,
      ],
    };
    if (
      Math.hypot(
        fromA.position[0] - fromB.position[0],
        fromA.position[1] - fromB.position[1],
      ) >
      9 + distance + BOAT_MAX_SPEED * predict
    )
      continue;
    const hit = sweepBoatImpact(fromA, toA, fromB, toB);
    if (hit && (!best || hit.fraction < best.hit.fraction))
      best = { other, hit };
  }
  if (!best) return;
  apply(driver, best.hit.a, now);
  apply(best.other, best.hit.b, now);
  // The initiating player's final pose is broadcast by RoomCore. Observers
  // receive the other participant's same authoritative result as well.
  const message = JSON.stringify({
    type: "pose",
    player: best.other.state!.player,
  } satisfies ServerMessage);
  for (const c of connections) if (c !== best.other) c.send(message);
}
