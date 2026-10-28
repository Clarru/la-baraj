import type { ActivityKind, ActivityPose } from "./activity-state";
import { fireLightingDuration } from "./character-actions";
import type { BenchSeat } from "./seating-types";

export const activityDurations = {
  "sit-down": 700,
  "stand-up": 650,
  scoot: 600,
  cast: 850,
  bite: 2400,
  reel: 950,
  catch: 1400,
} as const;
export type ActivityInteraction = {
  kind: ActivityKind;
  deadline: number;
  biteAt?: number;
  station?: number;
  seatId?: string;
  standAfterMove?: boolean;
  pose?: Omit<ActivityPose, "kind" | "startedAt">;
};
export const idleActivity = (): ActivityInteraction => ({
  kind: "none",
  deadline: Infinity,
});

/** Called at most once per rendered frame, so each gesture remains visible. */
export function advanceActivity(
  state: ActivityInteraction,
  now: number,
): {
  state: ActivityInteraction;
  outcome?: "caught" | "escaped" | "seat-moved";
} {
  if (now < state.deadline) return { state };
  switch (state.kind) {
    case "sit-down":
      return { state: { ...state, kind: "sit", deadline: Infinity } };
    case "scoot-left":
    case "scoot-right": {
      const {
        fromAnchor: _from,
        shiftDuration: _duration,
        ...pose
      } = state.pose ?? {};
      return {
        state: {
          ...state,
          kind: state.standAfterMove ? "stand-up" : "sit",
          deadline: state.standAfterMove
            ? now + activityDurations["stand-up"]
            : Infinity,
          pose,
        },
        outcome: "seat-moved",
      };
    }
    case "fire-approach": {
      const {
        fromAnchor: _from,
        shiftDuration: _duration,
        ...pose
      } = state.pose ?? {};
      return {
        state: {
          kind: "light-fire",
          deadline: now + fireLightingDuration * 1000,
          pose,
        },
      };
    }
    case "light-fire":
    case "stand-up":
    case "catch":
      return { state: idleActivity() };
    case "cast":
      return {
        state: { ...state, kind: "fish-wait", deadline: state.biteAt ?? now },
      };
    case "fish-wait":
      return {
        state: {
          ...state,
          kind: "bite",
          deadline: now + activityDurations.bite,
        },
      };
    case "bite":
      return { state: idleActivity(), outcome: "escaped" };
    case "reel":
      return {
        state: {
          ...state,
          kind: "catch",
          deadline: now + activityDurations.catch,
        },
        outcome: "caught",
      };
    default:
      return { state };
  }
}

export function cancelActivity(
  state: ActivityInteraction,
  now: number,
): ActivityInteraction {
  if (state.kind === "scoot-left" || state.kind === "scoot-right")
    return { ...state, standAfterMove: true };
  if (state.kind === "sit" || state.kind === "sit-down")
    return {
      ...state,
      kind: "stand-up",
      deadline: now + activityDurations["stand-up"],
    };
  if (state.kind === "stand-up") return state;
  return idleActivity();
}

export function beginFishing(
  station: number,
  pose: ActivityInteraction["pose"],
  now: number,
  random: number,
): ActivityInteraction {
  return {
    kind: "cast",
    deadline: now + activityDurations.cast,
    biteAt: now + 2800 + Math.max(0, Math.min(1, random)) * 1800,
    station,
    pose,
  };
}

/** The registry has already claimed this seat before the gesture begins. */
export function beginSitting(
  seat: BenchSeat,
  now: number,
): ActivityInteraction {
  return {
    kind: "sit-down",
    deadline: now + activityDurations["sit-down"],
    seatId: seat.id,
    pose: {
      anchor: seat.anchor,
      facing: seat.facing,
      seatHeight: seat.seatHeight,
    },
  };
}

/** Shift only one adjacent slot; the registry has already reserved both endpoints. */
export function beginSeatMove(
  from: BenchSeat,
  to: BenchSeat,
  now: number,
): ActivityInteraction {
  const step = to.index - from.index;
  if (from.benchId !== to.benchId || Math.abs(step) !== 1)
    throw new Error(
      "A seated move must use one adjacent seat on the same bench",
    );
  return {
    kind: step > 0 ? "scoot-left" : "scoot-right",
    deadline: now + activityDurations.scoot,
    seatId: to.id,
    pose: {
      anchor: to.anchor,
      fromAnchor: from.anchor,
      shiftDuration: activityDurations.scoot / 1000,
      facing: to.facing,
      seatHeight: to.seatHeight,
    },
  };
}
/** A/D follow the projected bench direction so orbiting the camera does not reverse screen controls. */
export function seatStepForKey(
  key: "KeyA" | "KeyD",
  facing: number,
  cameraRight: { x: number; z: number },
): -1 | 1 {
  const projection =
    Math.cos(facing) * cameraRight.x - Math.sin(facing) * cameraRight.z;
  const screenRightStep =
    projection >= 0.01 ? 1 : projection <= -0.01 ? -1 : -1;
  return (key === "KeyD" ? screenRightStep : -screenRightStep) as -1 | 1;
}

/** Removal or loss of an occupied seat must never leave movement locked. */
export function activitySeatIsValid(
  state: ActivityInteraction,
  seat: BenchSeat | undefined,
  actorId: string,
): boolean {
  return (
    !state.seatId || (seat?.id === state.seatId && seat.occupantId === actorId)
  );
}

/** A late key must not turn an already missed bite into a catch. */
export function reelActivity(
  state: ActivityInteraction,
  now: number,
): ActivityInteraction | undefined {
  if (state.kind !== "bite" || now >= state.deadline) return undefined;
  return { ...state, kind: "reel", deadline: now + activityDurations.reel };
}

/** Approach the near log edge, then play the authored kneel and lighting gesture. */
export function beginLightingFire(
  from: [number, number, number],
  center: [number, number, number],
  now: number,
): ActivityInteraction {
  const dx = from[0] - center[0],
    dz = from[2] - center[2];
  const distance = Math.hypot(dx, dz);
  const nx = distance > 0.001 ? dx / distance : 0;
  const nz = distance > 0.001 ? dz / distance : 1;
  const anchor: [number, number, number] = [
    center[0] + nx * 1.65,
    center[1],
    center[2] + nz * 1.65,
  ];
  const duration = Math.max(
    0.15,
    Math.hypot(anchor[0] - from[0], anchor[2] - from[2]) / 2.6,
  );
  return {
    kind: "fire-approach",
    deadline: now + duration * 1000,
    pose: {
      anchor,
      fromAnchor: from,
      shiftDuration: duration,
      facing: Math.atan2(-nx, -nz),
    },
  };
}
