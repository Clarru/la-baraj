import { LAKE_LEVEL } from "./swim-motion";

/** Motorboat tuning (rad, m, s): slower to turn and heavier than the scooter. */
export const BOAT_TUNING = {
  cruise: 8,
  reverse: 2,
  accel: 2.4,
  reverseAccel: 1.5,
  coastRate: 0.35,
  brakeDecel: 5,
  maxTurnRate: 0.9,
  fullTurnSpeed: 3,
  wheelMaxAngle: 2.4,
  leanMax: 0.06,
  rideHeight: 0.75,
  bobAmplitude: 0.03,
} as const;

/** `speed` is signed forward m/s; +Z is forward at yaw 0, positive yaw turns left. */
export type BoatMotionState = {
  yaw: number;
  speed: number;
  steer: number;
  turnRate: number;
  wheelAngle: number;
  lean: number;
};

export function createBoatMotionState(yaw: number): BoatMotionState {
  return {
    yaw: Number.isFinite(yaw) ? yaw : 0,
    speed: 0,
    steer: 0,
    turnRate: 0,
    wheelAngle: 0,
    lean: 0,
  };
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

function moveToward(value: number, target: number, step: number) {
  return value < target
    ? Math.min(value + step, target)
    : Math.max(value - step, target);
}

/** Wheel angle that mirrors the actual turn rate, not the key. */
export function boatWheelTarget(turnRate: number): number {
  return (
    clamp(turnRate / BOAT_TUNING.maxTurnRate, -1, 1) * BOAT_TUNING.wheelMaxAngle
  );
}

/** Advance throttle, damped steering and yaw by one step (mutates). */
export function advanceBoat(
  state: BoatMotionState,
  input: { throttle: -1 | 0 | 1; steer: number; dt: number },
): void {
  const dt = Number.isFinite(input.dt) ? clamp(input.dt, 0, 0.05) : 0;
  const steerInput = Number.isFinite(input.steer)
    ? clamp(input.steer, -1, 1)
    : 0;
  const t = BOAT_TUNING;

  if (input.throttle > 0) {
    state.speed = moveToward(state.speed, t.cruise, t.accel * dt);
  } else if (input.throttle < 0) {
    state.speed =
      state.speed > 0
        ? Math.max(0, state.speed - t.brakeDecel * dt)
        : moveToward(state.speed, -t.reverse, t.reverseAccel * dt);
  } else {
    state.speed = moveToward(state.speed, 0, t.coastRate * dt);
  }

  state.steer = damp(state.steer, steerInput, 6, dt);
  state.turnRate =
    state.steer *
    t.maxTurnRate *
    Math.min(Math.abs(state.speed) / t.fullTurnSpeed, 1) *
    Math.sign(state.speed);
  state.yaw += state.turnRate * dt;
  state.wheelAngle = damp(
    state.wheelAngle,
    boatWheelTarget(state.turnRate),
    10,
    dt,
  );
  state.lean = damp(
    state.lean,
    clamp(state.turnRate * Math.abs(state.speed) * 0.01, -t.leanMax, t.leanMax),
    4,
    dt,
  );
}

/** Drop commanded speed to the measured speed when the hull is blocked. */
export function reconcileBoatSpeed(commanded: number, measured: number) {
  if (commanded === 0) return 0;
  const forward = measured * Math.sign(commanded);
  if (forward >= Math.abs(commanded) * 0.9) return commanded;
  return forward < 0 ? 0 : measured;
}

/** Heading-driven horizontal velocity and a damped float at ride height. */
export function boatVelocity(input: {
  yaw: number;
  speed: number;
  velocityY: number;
  bodyY: number;
  time: number;
  dt: number;
}) {
  const dt = Number.isFinite(input.dt) ? clamp(input.dt, 0, 0.05) : 0;
  const floatY =
    LAKE_LEVEL +
    BOAT_TUNING.rideHeight +
    Math.sin(input.time * 1.6) * BOAT_TUNING.bobAmplitude;
  const desiredY = clamp((floatY - input.bodyY) * 4, -1.6, 1.6);
  return {
    x: Math.sin(input.yaw) * input.speed,
    y: damp(input.velocityY, desiredY, 8, dt),
    z: Math.cos(input.yaw) * input.speed,
  };
}

/** Yaw rate from two headings, wrapped across the ±π seam. */
export function inferBoatTurnRate(
  previousYaw: number,
  yaw: number,
  dt: number,
): number {
  if (!(dt > 0) || !Number.isFinite(dt)) return 0;
  const twoPi = Math.PI * 2;
  let delta = (yaw - previousYaw) % twoPi;
  if (delta > Math.PI) delta -= twoPi;
  else if (delta <= -Math.PI) delta += twoPi;
  return Number.isFinite(delta) ? delta / dt : 0;
}
