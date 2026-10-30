import type { ActivityPose } from "./activity-state";
import { CRUCE_CHARACTER_SEAT_HEIGHT } from "../../../packages/shared/cruce-station";
import type { CruceSeat } from "../../../packages/shared/cruce";
export type CruceSeatContact = {
  anchor: [number, number, number];
  height: number;
};
/** Pose-bound calibration survives authority clearing the seat during stand-up. */
export function cruceContactForPose(
  previous: CruceSeatContact | null,
  pose: Readonly<ActivityPose>,
  seat: CruceSeat | null,
): CruceSeatContact | null {
  if (
    !pose.anchor ||
    !["sit-down", "sit", "scoot-left", "scoot-right", "stand-up"].includes(
      pose.kind,
    )
  )
    return null;
  const same = previous?.anchor.every(
    (value, index) => value === pose.anchor![index],
  );
  if (seat !== null)
    return same
      ? previous
      : { anchor: [...pose.anchor], height: CRUCE_CHARACTER_SEAT_HEIGHT };
  return same ? previous : null;
}
