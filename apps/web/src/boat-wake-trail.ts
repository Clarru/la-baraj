import { BOAT_DIMENSIONS } from "./boat-geometry";

export const WAKE_TRAIL_SAMPLES = 48;
/** Metres the transom must move before a new sample is appended. */
export const WAKE_SAMPLE_DISTANCE = 0.35;
/** Seconds after which a new sample is appended even if the boat barely moved. */
export const WAKE_SAMPLE_INTERVAL = 0.15;
export const WAKE_FADE_SECONDS = 3.5;
/** A longer jump (teleport, respawn) clears the trail. */
export const WAKE_RESET_DISTANCE = 6;
export const WAKE_STRIPS = 3;
export const WAKE_ACROSS = 3;
export const WAKE_VERTEX_COUNT =
  WAKE_TRAIL_SAMPLES * WAKE_STRIPS * WAKE_ACROSS;

/** Floats per sample: x, z, time, spread, strength. */
const STRIDE = 5;

export type WakeTrail = { data: Float32Array; head: number; count: number };

export function createWakeTrail(): WakeTrail {
  return {
    data: new Float32Array(WAKE_TRAIL_SAMPLES * STRIDE),
    head: 0,
    count: 0,
  };
}

export function clearWakeTrail(trail: WakeTrail): void {
  trail.head = 0;
  trail.count = 0;
}

function append(
  trail: WakeTrail,
  x: number,
  z: number,
  time: number,
  spread: number,
  strength: number,
): void {
  trail.head = trail.count === 0 ? 0 : (trail.head + 1) % WAKE_TRAIL_SAMPLES;
  trail.count = Math.min(trail.count + 1, WAKE_TRAIL_SAMPLES);
  const o = trail.head * STRIDE;
  const d = trail.data;
  d[o] = x;
  d[o + 1] = z;
  d[o + 2] = time;
  d[o + 3] = spread;
  d[o + 4] = strength;
}

/** Returns true when a new sample was appended (vs. head moved or ignored). */
export function pushWakeSample(
  trail: WakeTrail,
  x: number,
  z: number,
  time: number,
  spread: number,
  strength: number,
): boolean {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    !Number.isFinite(time) ||
    !Number.isFinite(spread) ||
    !Number.isFinite(strength)
  )
    return false;
  if (trail.count > 0) {
    const o = trail.head * STRIDE;
    const d = trail.data;
    const distance = Math.hypot(x - d[o], z - d[o + 1]);
    if (distance > WAKE_RESET_DISTANCE) clearWakeTrail(trail);
    else if (
      distance < WAKE_SAMPLE_DISTANCE &&
      time - d[o + 2] < WAKE_SAMPLE_INTERVAL
    ) {
      d[o] = x;
      d[o + 1] = z;
      d[o + 3] = spread;
      d[o + 4] = strength;
      return false;
    }
  }
  append(trail, x, z, time, spread, strength);
  return true;
}

/** Drops samples older than WAKE_FADE_SECONDS; returns live count. */
export function pruneWakeTrail(trail: WakeTrail, time: number): number {
  while (trail.count > 0) {
    const oldest =
      (trail.head - trail.count + 1 + WAKE_TRAIL_SAMPLES) %
      WAKE_TRAIL_SAMPLES;
    if (time - trail.data[oldest * STRIDE + 2] <= WAKE_FADE_SECONDS) break;
    trail.count--;
  }
  return trail.count;
}

const slotOffset = (trail: WakeTrail, slot: number) =>
  ((trail.head - slot + WAKE_TRAIL_SAMPLES) % WAKE_TRAIL_SAMPLES) * STRIDE;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Writes WAKE_VERTEX_COUNT world-space vertices (xyz) and aux (along, across,
 * arm). Slot 0 is the newest sample, higher slots are older; unused slots
 * collapse onto the head. Returns the live sample count and fills `bounds`
 * with [centreX, centreZ, radius].
 */
export function layoutWakeRibbon(
  trail: WakeTrail,
  time: number,
  y: number,
  positions: Float32Array,
  aux: Float32Array,
  bounds: Float32Array,
): number {
  const d = trail.data;
  const count = trail.count;
  const beam = BOAT_DIMENSIONS.beam;

  let length = 0;
  let sx = 0;
  let sz = 0;
  for (let s = 0; s < count; s++) {
    const o = slotOffset(trail, s);
    sx += d[o];
    sz += d[o + 1];
    if (s > 0) {
      const p = slotOffset(trail, s - 1);
      length += Math.hypot(d[o] - d[p], d[o + 1] - d[p + 1]);
    }
  }
  const cx = count > 0 ? sx / count : 0;
  const cz = count > 0 ? sz / count : 0;
  let radius = 0;
  for (let s = 0; s < count; s++) {
    const o = slotOffset(trail, s);
    radius = Math.max(radius, Math.hypot(d[o] - cx, d[o + 1] - cz));
  }
  bounds[0] = cx;
  bounds[1] = cz;
  bounds[2] = radius;

  const headO = trail.head * STRIDE;
  const headX = count > 0 ? d[headO] : 0;
  const headZ = count > 0 ? d[headO + 1] : 0;

  let travelled = 0;
  for (let s = 0; s < WAKE_TRAIL_SAMPLES; s++) {
    const live = s < count;
    let x = headX;
    let z = headZ;
    let lx = 1;
    let lz = 0;
    let along = 0;
    let alongOut = 0;
    let spread = 0;
    if (live) {
      const o = slotOffset(trail, s);
      x = d[o];
      z = d[o + 1];
      spread = d[o + 3];
      if (s > 0) {
        const p = slotOffset(trail, s - 1);
        travelled += Math.hypot(x - d[p], z - d[p + 1]);
      }
      const older = slotOffset(trail, s + 1 < count ? s + 1 : s);
      const newer = slotOffset(trail, s > 0 ? s - 1 : s);
      const tx = d[newer] - d[older];
      const tz = d[newer + 1] - d[older + 1];
      const tl = Math.hypot(tx, tz);
      if (tl > 1e-6) {
        lx = -tz / tl;
        lz = tx / tl;
      }
      const byDistance = length > 0 ? travelled / length : 0;
      const byAge = (time - d[o + 2]) / WAKE_FADE_SECONDS;
      along = Math.min(1, Math.max(0, Math.max(byDistance, byAge)));
      alongOut = 1 - (1 - along) * d[o + 4];
    }
    for (let strip = 0; strip < WAKE_STRIPS; strip++) {
      const arm = strip - 1;
      const centre = arm * (beam * 0.425 + 0.5 * spread * along);
      const width =
        arm === 0
          ? mix(beam * 0.55, beam * 0.8, along)
          : 0.3 + 0.18 * spread * along;
      for (let a = 0; a < WAKE_ACROSS; a++) {
        const across = a - 1;
        const offset = live ? centre + across * width * 0.5 : 0;
        const v = (strip * WAKE_TRAIL_SAMPLES + s) * WAKE_ACROSS + a;
        positions[v * 3] = x + lx * offset;
        positions[v * 3 + 1] = y;
        positions[v * 3 + 2] = z + lz * offset;
        aux[v * 3] = alongOut;
        aux[v * 3 + 1] = live ? across : 0;
        aux[v * 3 + 2] = arm;
      }
    }
  }
  return count;
}

let ribbonIndex: Uint16Array | undefined;

/** Static triangle indices: each strip is consecutive slots as two quads. */
export function wakeRibbonIndex(): Uint16Array {
  if (ribbonIndex) return ribbonIndex;
  const segments = WAKE_TRAIL_SAMPLES - 1;
  const out = new Uint16Array(WAKE_STRIPS * segments * 2 * 6);
  let n = 0;
  for (let strip = 0; strip < WAKE_STRIPS; strip++) {
    const base = strip * WAKE_TRAIL_SAMPLES * WAKE_ACROSS;
    for (let i = 0; i < segments; i++)
      for (let j = 0; j < 2; j++) {
        const a = base + i * WAKE_ACROSS + j;
        const b = a + WAKE_ACROSS;
        out[n++] = a;
        out[n++] = b;
        out[n++] = a + 1;
        out[n++] = a + 1;
        out[n++] = b;
        out[n++] = b + 1;
      }
  }
  ribbonIndex = out;
  return out;
}
