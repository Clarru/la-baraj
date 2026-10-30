/** Shared runabout footprint, in metres; the pivot is on its waterline. */
export const BOAT_DIMENSIONS = {
  length: 6.146,
  beam: 2.207,
  bowExtent: 3.683,
  sternExtent: 2.463,
  draft: 0.5,
  deckHeight: 0.8,
} as const;
export type BoatPose = {
  position: [number, number];
  yaw: number;
  velocity: [number, number];
};
export type BoatBody = BoatPose & { moored: boolean };
export const BOAT_MAX_SPEED = 12.8;
export const BOAT_WATERLINE = 0.05;
const SKIN = 0.025;
const HALF_LENGTH = BOAT_DIMENSIONS.length / 2;
const HALF_BEAM = BOAT_DIMENSIONS.beam / 2;
const CENTRE = (BOAT_DIMENSIONS.bowExtent - BOAT_DIMENSIONS.sternExtent) / 2;
const RADIUS = Math.hypot(HALF_BEAM, BOAT_DIMENSIONS.bowExtent);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];
const axis = (yaw: number): [number, number] => [Math.sin(yaw), Math.cos(yaw)];
const centre = (b: BoatPose) => {
  const f = axis(b.yaw);
  return [b.position[0] + f[0] * CENTRE, b.position[1] + f[1] * CENTRE];
};
export function boatContact(a: BoatPose, b: BoatPose, padding = 0) {
  const af = axis(a.yaw),
    bf = axis(b.yaw);
  const ar: [number, number] = [af[1], -af[0]],
    br: [number, number] = [bf[1], -bf[0]];
  const ac = centre(a),
    bc = centre(b),
    distance = [bc[0] - ac[0], bc[1] - ac[1]];
  let penetration = Infinity,
    normal: [number, number] = [1, 0];
  for (const n of [ar, af, br, bf]) {
    const ra =
      HALF_BEAM * Math.abs(dot(ar, n)) + HALF_LENGTH * Math.abs(dot(af, n));
    const rb =
      HALF_BEAM * Math.abs(dot(br, n)) + HALF_LENGTH * Math.abs(dot(bf, n));
    const d = dot(distance, n),
      overlap = ra + rb + padding - Math.abs(d);
    if (overlap <= 0) return null;
    if (overlap < penetration) {
      penetration = overlap;
      const sign = d < 0 ? -1 : 1;
      normal = [n[0] * sign, n[1] * sign];
    }
  }
  return { normal, penetration };
}
export function boundedBoatVelocity(v: number[]): [number, number] {
  const speed = Math.hypot(...v);
  if (!Number.isFinite(speed)) return [0, 0];
  const scale = speed > BOAT_MAX_SPEED ? BOAT_MAX_SPEED / speed : 1;
  return [v[0] * scale, v[1] * scale];
}
function interpolate(a: BoatBody, b: BoatBody, t: number): BoatBody {
  return {
    ...b,
    position: [
      a.position[0] + (b.position[0] - a.position[0]) * t,
      a.position[1] + (b.position[1] - a.position[1]) * t,
    ],
    yaw: a.yaw + wrap(b.yaw - a.yaw) * t,
  };
}
/** Equal mass, damped impact. Moored hulls have infinite effective mass. */
export function resolveBoatImpact(a: BoatBody, b: BoatBody, padding = 0) {
  const contact = boatContact(a, b, padding);
  const ia = a.moored ? 0 : 1,
    ib = b.moored ? 0 : 1,
    mass = ia + ib;
  if (!contact || !mass) return null;
  const { normal: n, penetration } = contact;
  const av = a.moored ? [0, 0] : boundedBoatVelocity(a.velocity);
  const bv = b.moored ? [0, 0] : boundedBoatVelocity(b.velocity);
  const rv = [bv[0] - av[0], bv[1] - av[1]],
    closing = dot(rv, n);
  const impulse = closing < 0 ? -(1.05 * closing) / mass : 0;
  const tangent = [-n[1], n[0]],
    sliding = dot(rv, tangent);
  const friction = Math.max(
    -impulse * 0.12,
    Math.min(impulse * 0.12, -sliding / mass),
  );
  const push = [
    n[0] * impulse + tangent[0] * friction,
    n[1] * impulse + tangent[1] * friction,
  ];
  const correction = Math.min(penetration + SKIN, 1);
  const moved = (
    body: BoatBody,
    v: number[],
    inv: number,
    sign: number,
  ): BoatBody => ({
    ...body,
    position: [
      body.position[0] + (sign * n[0] * correction * inv) / mass,
      body.position[1] + (sign * n[1] * correction * inv) / mass,
    ],
    velocity: boundedBoatVelocity([
      v[0] + sign * push[0] * inv,
      v[1] + sign * push[1] * inv,
    ]),
  });
  return {
    a: moved(a, av, ia, -1),
    b: moved(b, bv, ib, 1),
    closingSpeed: Math.max(0, -closing),
  };
}
/** Conservative swept sampling at <= 0.1 m of relative hull-point travel. */
export function sweepBoatImpact(
  fromA: BoatBody,
  toA: BoatBody,
  fromB: BoatBody,
  toB: BoatBody,
) {
  const travel = (a: BoatBody, b: BoatBody) =>
    Math.hypot(b.position[0] - a.position[0], b.position[1] - a.position[1]) +
    RADIUS * Math.abs(wrap(b.yaw - a.yaw));
  const distance = travel(fromA, toA) + travel(fromB, toB);
  const steps = Math.min(128, Math.max(1, Math.ceil(distance / 0.1)));
  // This radius bounds relative hull-point travel to the nearest sample,
  // including rotation, so a grazing contact cannot slip between samples.
  const padding = distance / (2 * steps);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = interpolate(fromA, toA, t),
      b = interpolate(fromB, toB, t);
    const hit = resolveBoatImpact(a, b, padding);
    // The conservative margin must not catch and rewind boats already
    // moving apart after the preceding impact.
    if (hit && (hit.closingSpeed > 0.01 || boatContact(a, b)))
      return { ...hit, fraction: t };
  }
  return null;
}
