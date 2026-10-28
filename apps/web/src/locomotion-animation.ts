export type JumpPhase = "grounded" | "takeoff" | "airborne" | "landing";
export type JumpMotion = {
  phase: JumpPhase;
  startedAt: number;
  leftGround: boolean;
};
export const initialJumpMotion = (): JumpMotion => ({
  phase: "grounded",
  startedAt: 0,
  leftGround: false,
});
/** Physics contact drives takeoff/air/landing, rather than key-held or horizontal speed. */
export function advanceJumpMotion(
  state: JumpMotion,
  input: {
    now: number;
    grounded: boolean;
    verticalSpeed: number;
    jumpStarted: boolean;
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
    return { phase: "takeoff", startedAt: now, leftGround: false };
  const elapsed = Math.max(0, now - state.startedAt);
  if (state.phase === "grounded")
    return !grounded
      ? { phase: "airborne", startedAt: now, leftGround: true }
      : state;
  if (state.phase === "takeoff") {
    const leftGround = state.leftGround || !grounded;
    if (leftGround && grounded && verticalSpeed <= 0.8)
      return { phase: "landing", startedAt: now, leftGround: false };
    return elapsed >= 0.2
      ? { phase: "airborne", startedAt: now, leftGround }
      : { ...state, leftGround };
  }
  if (state.phase === "airborne") {
    if (
      grounded &&
      verticalSpeed <= 0.8 &&
      (state.leftGround || elapsed > 0.15)
    )
      return { phase: "landing", startedAt: now, leftGround: false };
    return state.leftGround || grounded
      ? state
      : { ...state, leftGround: true };
  }
  if (!grounded) return { phase: "airborne", startedAt: now, leftGround: true };
  return elapsed >= 0.24
    ? { phase: "grounded", startedAt: now, leftGround: false }
    : state;
}
export function jumpAnimation(
  phase: JumpPhase,
): { name: string; duration: number; loop: boolean } | null {
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
