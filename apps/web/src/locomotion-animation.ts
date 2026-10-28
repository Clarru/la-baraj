export type JumpPhase = "grounded" | "takeoff" | "airborne" | "landing";
export type JumpMotion = {
  phase: JumpPhase;
  startedAt: number;
  leftGround: boolean;
  style: "walk" | "run";
};
export const initialJumpMotion = (): JumpMotion => ({
  phase: "grounded",
  startedAt: 0,
  leftGround: false,
  style: "walk",
});
/** Physics contact drives takeoff/air/landing, rather than key-held or horizontal speed. */
export function advanceJumpMotion(
  state: JumpMotion,
  input: {
    now: number;
    grounded: boolean;
    verticalSpeed: number;
    jumpStarted: boolean;
    horizontalSpeed?: number;
    disabled?: boolean;
  },
): JumpMotion {
  const { now, grounded, verticalSpeed, jumpStarted, disabled } = input;
  if (disabled) return initialJumpMotion();
  if (
    jumpStarted &&
    grounded &&
    (state.phase === "grounded" || state.phase === "landing")
  )
    return {
      phase: "takeoff",
      startedAt: now,
      leftGround: false,
      style: (input.horizontalSpeed ?? 0) > 4 ? "run" : "walk",
    };
  const elapsed = Math.max(0, now - state.startedAt);
  if (state.phase === "grounded")
    return !grounded
      ? {
          ...state,
          phase: "airborne",
          startedAt: now,
          leftGround: true,
          style: (input.horizontalSpeed ?? 0) > 4 ? "run" : "walk",
        }
      : state;
  if (state.phase === "takeoff") {
    const leftGround = state.leftGround || !grounded;
    if (leftGround && grounded && verticalSpeed <= 0.8)
      return { ...state, phase: "landing", startedAt: now, leftGround: false };
    return elapsed >= 0.2
      ? { ...state, phase: "airborne", startedAt: now, leftGround }
      : { ...state, leftGround };
  }
  if (state.phase === "airborne") {
    if (
      grounded &&
      verticalSpeed <= 0.8 &&
      (state.leftGround || elapsed > 0.15)
    )
      return { ...state, phase: "landing", startedAt: now, leftGround: false };
    return state.leftGround || grounded
      ? state
      : { ...state, leftGround: true };
  }
  if (!grounded)
    return { ...state, phase: "airborne", startedAt: now, leftGround: true };
  return elapsed >= (state.style === "run" ? 0.16 : 0.24)
    ? { ...state, phase: "grounded", startedAt: now, leftGround: false }
    : state;
}
export function jumpAnimation(
  phase: JumpPhase,
  style: JumpMotion["style"] = "walk",
): { name: string; duration: number; loop: boolean } | null {
  if (style === "run") {
    switch (phase) {
      case "takeoff":
        return { name: "Jump_RunStart", duration: 0.2, loop: false };
      case "airborne":
        return { name: "Jump_RunAir", duration: 0.65, loop: false };
      case "landing":
        return { name: "Jump_RunLand", duration: 0.16, loop: false };
      default:
        return null;
    }
  }
  switch (phase) {
    case "takeoff":
      return { name: "Jump_Start", duration: 0.2, loop: false };
    case "airborne":
      return { name: "Jump_Loop", duration: 0.8, loop: true };
    case "landing":
      return { name: "Jump_Land", duration: 0.24, loop: false };
    default:
      return null;
  }
}
