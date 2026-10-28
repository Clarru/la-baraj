/** Local pose handoff between activities and the player; no networking or persistence. */
export type ActivityKind =
  | "none"
  | "fire-approach"
  | "light-fire"
  | "sit-down"
  | "sit"
  | "scoot-left"
  | "scoot-right"
  | "stand-up"
  | "cast"
  | "fish-wait"
  | "bite"
  | "reel"
  | "catch";
export type ActivityPose = {
  kind: ActivityKind;
  startedAt: number;
  /** Character root at floor level, in world coordinates. */
  anchor?: [number, number, number];
  /** World yaw; character forward is +Z. */
  facing?: number;
  /** Absolute seat surface height, for campfire bench alignment. */
  seatHeight?: number;
  /** Optional world-space float for the fishing line. */
  lineTarget?: [number, number, number];
  /** Starting floor anchor for a seated side-step; anchor remains the destination. */
  fromAnchor?: [number, number, number];
  /** Seated shift duration in seconds. */
  shiftDuration?: number;
};
let pose: ActivityPose = { kind: "none", startedAt: 0 };
export function sampleActivityPose(
  current: Readonly<ActivityPose>,
  now: number,
): Readonly<ActivityPose> {
  if (
    (current.kind !== "scoot-left" &&
      current.kind !== "scoot-right" &&
      current.kind !== "fire-approach") ||
    !current.anchor ||
    !current.fromAnchor
  )
    return current;
  const duration = current.shiftDuration ?? 0.6;
  const t =
    Number.isFinite(duration) && duration > 0
      ? Math.max(0, Math.min(1, (now - current.startedAt) / (duration * 1000)))
      : 1;
  const eased = t * t * (3 - 2 * t);
  return {
    ...current,
    anchor: current.fromAnchor.map(
      (value, i) => value + (current.anchor![i] - value) * eased,
    ) as [number, number, number],
  };
}
export function getActivityPose(): Readonly<ActivityPose> {
  return sampleActivityPose(pose, performance.now());
}
export function setActivityPose(
  kind: ActivityKind,
  options: Omit<ActivityPose, "kind" | "startedAt"> = {},
): void {
  pose = { ...options, kind, startedAt: performance.now() };
}
