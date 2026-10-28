export const scooterSpeed = { cruise: 10, boost: 13, brakeRate: 9 } as const;
/** Steering is travel-driven, so turning the bars at rest does not spin the scooter. */
export function scooterHeading(
  yaw: number,
  steer: number,
  speed: number,
  dt: number,
): number {
  if (![yaw, steer, speed, dt].every(Number.isFinite))
    return Number.isFinite(yaw) ? yaw : 0;
  return (
    yaw +
    Math.max(-1, Math.min(1, steer)) *
      1.65 *
      Math.min(Math.abs(speed) / 2, 1) *
      Math.max(0, Math.min(dt, 0.05))
  );
}
