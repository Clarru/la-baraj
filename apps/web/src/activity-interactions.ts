import type { ActivityKind, ActivityPose } from "./activity-state";
import type { BenchSeat } from "./seating-types";

export const activityDurations = {
  "sit-down": 700,
  "stand-up": 650,
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
  outcome?: "caught" | "escaped";
} {
  if (now < state.deadline) return { state };
  switch (state.kind) {
    case "sit-down":
      return { state: { ...state, kind: "sit", deadline: Infinity } };
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
