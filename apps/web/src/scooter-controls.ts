export const scooterSpeed = {
  cruise: 10,
  boost: 13,
  reverse: 2.5,
  brakeRate: 9,
} as const;
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
      Math.sign(speed) *
      Math.max(0, Math.min(dt, 0.05))
  );
}

/** +Z-forward objects turn toward their own left with positive Y yaw. */
export function scooterSteeringInput(left: boolean, right: boolean): number {
  return Number(left) - Number(right);
}

/** Brake against current travel before changing direction; opposite keys hold the brake. */
export function scooterDriveInput(
  speed: number,
  forward: boolean,
  backward: boolean,
): {
  throttle: -1 | 0 | 1;
  braking: boolean;
  reversing: boolean;
} {
  if (!Number.isFinite(speed))
    return { throttle: 0, braking: true, reversing: false };
  const braking =
    (forward && backward) ||
    (backward && speed > 0.2) ||
    (forward && speed < -0.2);
  const throttle = braking ? 0 : backward ? -1 : forward ? 1 : 0;
  return { throttle, braking, reversing: throttle === -1 || speed < -0.2 };
}
