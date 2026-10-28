/** The intentionally small, versioned friends-playtest wire protocol. */
export const PROTOCOL_VERSION = 1 as const;
/** Retains the existing world's Durable Object and anonymous home ownership. */
export const CANONICAL_WORLD_ID = "27f6361b353f4b5db885fd37fac89eda";
export const MAX_PLAYERS = 50;
export const MAX_HOMES = 50;
/** Intentional village reset: old random ownership and placements are retired. */
export const HOUSING_EPOCH = 2;
export const HOME_NAME_GRACE_MS = 5 * 60 * 1000;
export type PublicCabin = { index: number; ownerName: string | null };
export type VillageState = { epoch: number; cabins: PublicCabin[] };
export const MAX_PACKET_BYTES = 1024;
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{22,80}$/;

export type PlayerPose = {
  /** World-space feet/root position, rather than the physics capsule center. */
  position: [number, number, number];
  yaw: number;
  animation: string;
  activity: string;
  vehicle: "none" | "scooter";
  speed?: number;
  jumpPhase?: string;
  seatId?: string;
};
export type PlayerPresence = PlayerPose & {
  id: string;
  nickname: string;
  homeIndex?: number;
};
/** Private to the owning connection; never embed this in public presence. */
export type HomeAssignment = { index: number; resumeToken: string };
export type FireState = { lit: boolean; revision: number };
export type ClientMessage =
  | {
      type: "hello";
      nickname: string;
      requestHome?: true;
      resumeToken?: string;
      createHome?: true;
      housingEpoch?: number;
    }
  | { type: "pose"; pose: PlayerPose }
  | { type: "fire"; lit: boolean }
  | { type: "seat"; seatId: string | null; requestId: string }
  | { type: "sync" };
export type ServerMessage =
  | {
      type: "snapshot";
      version: typeof PROTOCOL_VERSION;
      selfId: string;
      players: PlayerPresence[];
      fire: FireState;
      seats: Record<string, string>;
      home?: HomeAssignment;
      village?: VillageState;
    }
  | { type: "village"; village: VillageState }
  | { type: "joined"; player: PlayerPresence }
  | { type: "pose"; player: PlayerPresence }
  | { type: "left"; id: string }
  | { type: "fire"; fire: FireState }
  | { type: "seats"; seats: Record<string, string> }
  | {
      type: "seat-result";
      requestId: string;
      accepted: boolean;
      seatId: string | null;
      reason?: string;
    }
  | { type: "error"; code: string; message: string };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function label(value: unknown, max = 48): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    /^[A-Za-z0-9_ :.-]+$/.test(value)
  );
}
export function isSeatId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 100 &&
    /^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+){0,3}:seat:[0-9]{1,2}$/.test(value)
  );
}
export function isResumeToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
/** Validates and copies allowed fields; arbitrary IDs and prototype keys never enter state. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (
    raw.length > MAX_PACKET_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_PACKET_BYTES
  )
    return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!object(value)) return null;
  switch (value.type) {
    case "sync":
      return { type: "sync" };
    case "hello": {
      if (typeof value.nickname !== "string") return null;
      const nickname = value.nickname.trim();
      if (
        nickname.length < 1 ||
        nickname.length > 24 ||
        /[\p{C}<>]/u.test(nickname)
      )
        return null;
      if (
        (value.housingEpoch !== undefined &&
          value.housingEpoch !== HOUSING_EPOCH) ||
        (value.requestHome !== undefined && value.requestHome !== true) ||
        (value.createHome !== undefined && value.createHome !== true) ||
        (value.resumeToken !== undefined &&
          !isResumeToken(value.resumeToken)) ||
        (value.requestHome === true && !isResumeToken(value.resumeToken)) ||
        (value.createHome === true && value.requestHome !== true)
      )
        return null;
      return {
        type: "hello",
        nickname,
        ...(value.housingEpoch === undefined
          ? {}
          : { housingEpoch: HOUSING_EPOCH }),
        ...(value.requestHome === true
          ? {
              requestHome: true as const,
              resumeToken: value.resumeToken as string,
            }
          : {}),
        ...(value.createHome === true ? { createHome: true as const } : {}),
      };
    }
    case "fire":
      return typeof value.lit === "boolean"
        ? { type: "fire", lit: value.lit }
        : null;
    case "seat":
      return (value.seatId === null || isSeatId(value.seatId)) &&
        label(value.requestId, 64)
        ? { type: "seat", seatId: value.seatId, requestId: value.requestId }
        : null;
    case "pose": {
      const pose = value.pose;
      if (
        !object(pose) ||
        !Array.isArray(pose.position) ||
        pose.position.length !== 3 ||
        !pose.position.every(
          (n) =>
            typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 5000,
        ) ||
        typeof pose.yaw !== "number" ||
        !Number.isFinite(pose.yaw) ||
        Math.abs(pose.yaw) > 100 * Math.PI ||
        !label(pose.animation) ||
        !label(pose.activity) ||
        !["none", "scooter"].includes(pose.vehicle as string) ||
        (pose.seatId !== undefined && !isSeatId(pose.seatId)) ||
        (pose.speed !== undefined &&
          (typeof pose.speed !== "number" ||
            !Number.isFinite(pose.speed) ||
            Math.abs(pose.speed) > 100)) ||
        (pose.jumpPhase !== undefined && !label(pose.jumpPhase))
      )
        return null;
      return {
        type: "pose",
        pose: {
          position: [...pose.position] as PlayerPose["position"],
          yaw: Math.atan2(Math.sin(pose.yaw), Math.cos(pose.yaw)),
          animation: pose.animation,
          activity: pose.activity,
          vehicle: pose.vehicle as PlayerPose["vehicle"],
          ...(pose.seatId === undefined ? {} : { seatId: pose.seatId }),
          ...(pose.speed === undefined ? {} : { speed: pose.speed as number }),
          ...(pose.jumpPhase === undefined
            ? {}
            : { jumpPhase: pose.jumpPhase }),
        },
      };
    }
    default:
      return null;
  }
}
