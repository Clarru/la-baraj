/** Local pose handoff between activities and the player; no networking or persistence. */
export type ActivityKind =
  | "none"
  | "sit-down"
  | "sit"
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
};
let pose: ActivityPose = { kind: "none", startedAt: 0 };
export function getActivityPose(): Readonly<ActivityPose> {
  return pose;
}
export function setActivityPose(
  kind: ActivityKind,
  options: Omit<ActivityPose, "kind" | "startedAt"> = {},
): void {
  pose = { ...options, kind, startedAt: performance.now() };
}
