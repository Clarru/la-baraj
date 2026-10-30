import type { Lighting } from "./day-night";
import { lightingAt } from "./day-night";
import { BOAT_HULL } from "../../../packages/shared/boats";
export type WakeMotion = {
  x: number;
  z: number;
  yaw: number;
  propeller: boolean;
};
/** The wake leaves the trailing hull edge and follows travel, not collision yaw. */
export function wakeMotion(
  vx: number,
  vz: number,
  target: WakeMotion = { x: 0, z: 0, yaw: 0, propeller: false },
): WakeMotion {
  const speed = Math.hypot(vx, vz);
  if (!Number.isFinite(speed) || speed < 0.1) {
    target.x = target.z = target.yaw = 0;
    target.propeller = false;
    return target;
  }
  let support = Infinity,
    x = 0,
    z = 0,
    count = 0;
  for (const p of BOAT_HULL) {
    const d = p[0] * vx + p[1] * vz;
    if (d < support - 1e-6) {
      support = d;
      x = p[0];
      z = p[1];
      count = 1;
    } else if (Math.abs(d - support) < 1e-6) {
      x += p[0];
      z += p[1];
      count++;
    }
  }
  target.x = x / count;
  target.z = z / count;
  target.yaw = Math.atan2(vx, vz);
  target.propeller = vz > SPRAY_MIN_SPEED;
  return target;
}

/** Below this |speed| (m/s) the jet stream is gone. */
export const SPRAY_MIN_SPEED = 0.5;
/** Speed (m/s) by which the stream has fully faded in. */
const SPRAY_FULL_SPEED = 2.5;
/** V-wake length and far-end spread (m) at cruise. */
const WAKE_LENGTH_AT_CRUISE = 9;
const WAKE_SPREAD_AT_CRUISE = 4.2;
/** Above cruise the stream keeps growing as (speed / cruise)^GROWTH: 1.46× at 1.6× cruise. */
const GROWTH = 0.8;

export type SpraySize = { length: number; width: number; opacity: number };

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Jet-stream size for a hull speed: zero below 0.5 m/s, fading in by
 * 2.5 m/s, and still growing above cruise so a boost reads bigger. Pass
 * `target` to reuse an object (per-frame callers must not allocate).
 */
export function spraySize(
  speed: number,
  cruise: number,
  target: SpraySize = { length: 0, width: 0, opacity: 0 },
): SpraySize {
  const s = Math.abs(speed);
  if (!Number.isFinite(s) || !(cruise > 0) || s < SPRAY_MIN_SPEED) {
    target.length = target.width = target.opacity = 0;
    return target;
  }
  const fade = smoothstep(SPRAY_MIN_SPEED, SPRAY_FULL_SPEED, s);
  const grow = fade * (s / cruise) ** GROWTH;
  target.length = WAKE_LENGTH_AT_CRUISE * grow;
  target.width = WAKE_SPREAD_AT_CRUISE * grow;
  target.opacity = fade * (0.6 + 0.4 * Math.min(s / (cruise * 1.6), 1));
  return target;
}

const brightness = (lighting: Lighting) =>
  lighting.sunIntensity + 2 * lighting.hemiIntensity;
const NIGHT = brightness(lightingAt(0));
const DAY = brightness(lightingAt(12));
const NIGHT_INTENSITY = 0.3;

/** Foam brightness: 0.3 at midnight's light to 1.0 at noon's, so it never glows at night. */
export function sprayIntensity(lighting: Lighting): number {
  const day = Math.max(
    0,
    Math.min(1, (brightness(lighting) - NIGHT) / (DAY - NIGHT)),
  );
  return NIGHT_INTENSITY + (1 - NIGHT_INTENSITY) * day;
}
