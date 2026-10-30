import { LAKE_LEVEL } from "./swim-motion";
import {
  boundedBoatVelocity,
  boundedBoatAngularVelocity,
  BOAT_ANGULAR_DRAG,
  wrapBoatYaw,
  type BoatPose,
} from "../../../packages/shared/boats";

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
  /** Run key + throttle: top speed is cruise × this. */
  boostMultiplier: 1.6,
  /** m/s² from cruise up to the boosted top speed. */
  boostAccel: 2,
  /** Max turn rate at full boost, as a fraction of maxTurnRate. */
  boostTurnFactor: 0.75,
  /** m/s² back down to cruise after the boost is released with W held (~3 s). */
  boostDecay: 1.6,
} as const;

/** `speed` is signed forward m/s; +Z is forward at yaw 0, positive yaw turns left. */
export type BoatMotionState = {
  yaw: number;
  speed: number;
  steer: number;
  turnRate: number;
  wheelAngle: number;
  lean: number;
  driftX: number;
  driftZ: number;
};

export function createBoatMotionState(yaw: number): BoatMotionState {
  return {
    yaw: Number.isFinite(yaw) ? yaw : 0,
    speed: 0,
    steer: 0,
    turnRate: 0,
    wheelAngle: 0,
    lean: 0,
    driftX: 0,
    driftZ: 0,
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

/** 1 at or below cruise, easing to boostTurnFactor at the boosted top speed. */
export function boostTurnScale(speed: number): number {
  const t = BOAT_TUNING;
  const over = clamp(
    (Math.abs(speed) - t.cruise) / (t.cruise * (t.boostMultiplier - 1)),
    0,
    1,
  );
  return 1 - (1 - t.boostTurnFactor) * over;
}

/** Advance throttle, damped steering and yaw by one step (mutates). */
export function advanceBoat(
  state: BoatMotionState,
  input: {
    throttle: -1 | 0 | 1;
    steer: number;
    dt: number;
    boost?: boolean;
    /** Accept the swept heading before publishing it or animating the wheel. */
    canTurn?: (fromYaw: number, toYaw: number) => boolean;
  },
): void {
  const dt = Number.isFinite(input.dt) ? clamp(input.dt, 0, 0.05) : 0;
  const steerInput = Number.isFinite(input.steer)
    ? clamp(input.steer, -1, 1)
    : 0;
  const t = BOAT_TUNING;

  const boost = input.boost === true && input.throttle > 0;
  if (input.throttle > 0) {
    // Above cruise: boost climbs toward its top speed; without boost the hull
    // eases back down to cruise in a few seconds, never instantly.
    if (boost && state.speed >= t.cruise)
      state.speed = moveToward(
        state.speed,
        t.cruise * t.boostMultiplier,
        t.boostAccel * dt,
      );
    else if (!boost && state.speed > t.cruise)
      state.speed = moveToward(state.speed, t.cruise, t.boostDecay * dt);
    else state.speed = moveToward(state.speed, t.cruise, t.accel * dt);
  } else if (input.throttle < 0) {
    state.speed =
      state.speed > 0
        ? Math.max(0, state.speed - t.brakeDecel * dt)
        : moveToward(state.speed, -t.reverse, t.reverseAccel * dt);
  } else {
    state.speed = moveToward(state.speed, 0, t.coastRate * dt);
  }

  state.steer = damp(state.steer, steerInput, 6, dt);
  const targetTurnRate =
    state.steer *
    t.maxTurnRate *
    Math.min(Math.abs(state.speed) / t.fullTurnSpeed, 1) *
    boostTurnScale(state.speed) *
    Math.sign(state.speed);
  state.turnRate = damp(state.turnRate, targetTurnRate, BOAT_ANGULAR_DRAG, dt);
  const worldX = Math.sin(state.yaw) * state.speed + state.driftX;
  const worldZ = Math.cos(state.yaw) * state.speed + state.driftZ;
  const nextYaw = state.yaw + state.turnRate * dt;
  if (
    nextYaw !== state.yaw &&
    input.canTurn &&
    !input.canTurn(state.yaw, nextYaw)
  )
    state.turnRate = 0;
  else if (nextYaw !== state.yaw) state.yaw = wrapBoatYaw(nextYaw);
  // Rotating the hull cannot rotate its momentum for free. Water gradually
  // removes lateral slip; the motor has already accelerated along the old keel.
  state.speed = worldX * Math.sin(state.yaw) + worldZ * Math.cos(state.yaw);
  const sideDrag = Math.exp(-2.5 * dt);
  state.driftX = (worldX - Math.sin(state.yaw) * state.speed) * sideDrag;
  state.driftZ = (worldZ - Math.cos(state.yaw) * state.speed) * sideDrag;
  setBoatVelocity(state, [
    Math.sin(state.yaw) * state.speed + state.driftX,
    Math.cos(state.yaw) * state.speed + state.driftZ,
  ]);
  state.wheelAngle = damp(
    state.wheelAngle,
    state.steer * t.wheelMaxAngle,
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
  driftX?: number;
  driftZ?: number;
}) {
  const dt = Number.isFinite(input.dt) ? clamp(input.dt, 0, 0.05) : 0;
  const floatY =
    LAKE_LEVEL +
    BOAT_TUNING.rideHeight +
    Math.sin(input.time * 1.6) * BOAT_TUNING.bobAmplitude;
  const desiredY = clamp((floatY - input.bodyY) * 4, -1.6, 1.6);
  const [x, z] = boundedBoatVelocity([
    Math.sin(input.yaw) * input.speed + (input.driftX ?? 0),
    Math.cos(input.yaw) * input.speed + (input.driftZ ?? 0),
  ]);
  return {
    x,
    y: damp(input.velocityY, desiredY, 8, dt),
    z,
  };
}

/** Adopt server momentum without changing the float height or driving state. */
export function applyBoatImpact(state: BoatMotionState, boat: BoatPose) {
  state.yaw = boat.yaw;
  setBoatVelocity(state, boat.velocity);
  state.turnRate = boundedBoatAngularVelocity(boat.angularVelocity ?? 0);
}
export function setBoatVelocity(state: BoatMotionState, velocity: number[]) {
  const [x, z] = boundedBoatVelocity(velocity),
    fx = Math.sin(state.yaw),
    fz = Math.cos(state.yaw);
  state.speed = x * fx + z * fz;
  state.driftX = x - fx * state.speed;
  state.driftZ = z - fz * state.speed;
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
