/** Surface-only runabout physics. Coordinates are x/z; positive yaw turns +Z toward +X. */
export const BOAT_DIMENSIONS = {
  length: 6.146,
  beam: 2.207,
  bowExtent: 3.683,
  sternExtent: 2.463,
  draft: 0.5,
  deckHeight: 0.8,
} as const;
export type Vec2 = [number, number];
export type BoatPose = {
  position: Vec2;
  yaw: number;
  velocity: Vec2;
  /** Optional fields retain compatibility with the first collision clients. */
  angularVelocity?: number;
  rudder?: number;
};
export type BoatBody = BoatPose & { moored: boolean; rotationLocked?: boolean };
export const BOAT_MAX_SPEED = 12.8;
export const BOAT_MAX_ANGULAR_SPEED = 1.8;
export const BOAT_WATERLINE = 0.05;
export const BOAT_MASS = 650;
/** Effective mass centre is the authored pivot, balancing the stern engine and bow. */
export const BOAT_YAW_INERTIA =
  (BOAT_MASS * (BOAT_DIMENSIONS.length ** 2 + BOAT_DIMENSIONS.beam ** 2)) / 12;
export const BOAT_ANGULAR_DRAG = 3;
const SKIN = 0.025,
  CONTACT_ITERATIONS = 8;
const h = BOAT_DIMENSIONS.beam / 2;
/** Convex waterline footprint: broad quarters, flat transom and pointed bow. CCW in x/z. */
export const BOAT_HULL: readonly Vec2[] = [
  [-h * 0.86, -BOAT_DIMENSIONS.sternExtent],
  [h * 0.86, -BOAT_DIMENSIONS.sternExtent],
  [h, 0.35],
  [h * 0.53, 2.65],
  [0, BOAT_DIMENSIONS.bowExtent],
  [-h * 0.53, 2.65],
  [-h, 0.35],
];
const RADIUS = Math.max(...BOAT_HULL.map((p) => Math.hypot(...p)));
export const wrapBoatYaw = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
/** Right-handed torque around world +Y, rather than an x/y-screen cross product. */
const cross = (a: Vec2, b: Vec2) => a[1] * b[0] - a[0] * b[1];
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
function normal(a: Vec2, b: Vec2): Vec2 {
  const x = b[0] - a[0],
    z = b[1] - a[1],
    length = Math.hypot(x, z);
  return [z / length, -x / length];
}
const HULL_NORMALS = BOAT_HULL.map((p, i) =>
  normal(p, BOAT_HULL[(i + 1) % BOAT_HULL.length]),
);
export function boatHullPoints(
  body: Pick<BoatPose, "position" | "yaw">,
  padding = 0,
): Vec2[] {
  const c = Math.cos(body.yaw),
    s = Math.sin(body.yaw);
  return BOAT_HULL.map((p, i) => {
    let x = p[0],
      z = p[1];
    if (padding > 0) {
      const a =
          HULL_NORMALS[(i + HULL_NORMALS.length - 1) % HULL_NORMALS.length],
        b = HULL_NORMALS[i];
      const scale = padding / (1 + dot(a, b));
      x += (a[0] + b[0]) * scale;
      z += (a[1] + b[1]) * scale;
    }
    return [body.position[0] + x * c + z * s, body.position[1] - x * s + z * c];
  });
}
type Contact = { normal: Vec2; penetration: number; points: Vec2[] };
export const BOAT_CONTACT_WORK_LIMIT = 4096;
export const BOAT_MAX_CONTACT_ISLAND = 12;
type ContactBudget = { remaining: number; used: number; exhausted: boolean };
function spend(budget: ContactBudget | undefined, units: number) {
  if (!budget) return true;
  if (budget.remaining < units) {
    budget.exhausted = true;
    return false;
  }
  budget.remaining -= units;
  budget.used += units;
  return true;
}

function sat(a: Vec2[], b: Vec2[], padding: number) {
  let penetration = Infinity,
    axis: Vec2 = [1, 0];
  const ac: Vec2 = [
    a.reduce((s, p) => s + p[0], 0) / a.length,
    a.reduce((s, p) => s + p[1], 0) / a.length,
  ];
  const bc: Vec2 = [
    b.reduce((s, p) => s + p[0], 0) / b.length,
    b.reduce((s, p) => s + p[1], 0) / b.length,
  ];
  const candidates: { axis: Vec2; depth: number }[] = [];
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const n = normal(polygon[i], polygon[(i + 1) % polygon.length]);
      let amin = Infinity,
        amax = -Infinity,
        bmin = Infinity,
        bmax = -Infinity;
      for (const p of a) {
        const d = dot(p, n);
        amin = Math.min(amin, d);
        amax = Math.max(amax, d);
      }
      for (const p of b) {
        const d = dot(p, n);
        bmin = Math.min(bmin, d);
        bmax = Math.max(bmax, d);
      }
      const overlap = Math.min(amax - bmin, bmax - amin) + padding;
      if (overlap <= 0) return null;
      const sign = dot([bc[0] - ac[0], bc[1] - ac[1]], n) < 0 ? -1 : 1;
      candidates.push({ axis: [n[0] * sign, n[1] * sign], depth: overlap });
      if (overlap < penetration) {
        penetration = overlap;
        const sign = dot([bc[0] - ac[0], bc[1] - ac[1]], n) < 0 ? -1 : 1;
        axis = [n[0] * sign, n[1] * sign];
      }
    }
  // Equal corner features need a symmetric normal. Choosing the first SAT
  // edge arbitrarily would spin a perfectly centred bow-to-bow collision.
  const tolerance = Math.max(1e-5, penetration * 0.05);
  let nx = 0,
    nz = 0;
  for (const c of candidates)
    if (c.depth <= penetration + tolerance) {
      const weight = 1 - (c.depth - penetration) / (tolerance * 1.01);
      nx += c.axis[0] * weight;
      nz += c.axis[1] * weight;
    }
  const length = Math.hypot(nx, nz);
  if (length > 0.1) {
    axis = [nx / length, nz / length];
    const ap = a.map((p) => dot(p, axis)),
      bp = b.map((p) => dot(p, axis));
    penetration =
      Math.min(
        Math.max(...ap) - Math.min(...bp),
        Math.max(...bp) - Math.min(...ap),
      ) + padding;
  }
  return { normal: axis, penetration };
}
function support(points: Vec2[], n: Vec2, sign: number): Vec2 {
  let best = -Infinity,
    x = 0,
    z = 0,
    count = 0;
  for (const p of points) {
    const d = dot(p, n) * sign;
    if (d > best + 1e-7) {
      best = d;
      x = p[0];
      z = p[1];
      count = 1;
    } else if (Math.abs(d - best) < 1e-7) {
      x += p[0];
      z += p[1];
      count++;
    }
  }
  return [x / count, z / count];
}
function face(points: Vec2[], n: Vec2) {
  let score = -Infinity,
    index = 0;
  for (let i = 0; i < points.length; i++) {
    const d = dot(normal(points[i], points[(i + 1) % points.length]), n);
    if (d > score) {
      score = d;
      index = i;
    }
  }
  return {
    score,
    a: points[index],
    b: points[(index + 1) % points.length],
    normal: normal(points[index], points[(index + 1) % points.length]),
  };
}
function contactPoints(a: Vec2[], b: Vec2[], n: Vec2, padding: number): Vec2[] {
  const af = face(a, n),
    bf = face(b, [-n[0], -n[1]]);
  const reference = af.score >= bf.score ? af : bf,
    other = af.score >= bf.score ? b : a;
  if (reference.score > 0.98) {
    const incident = face(other, [-reference.normal[0], -reference.normal[1]]);
    const dx = reference.b[0] - reference.a[0],
      dz = reference.b[1] - reference.a[1],
      len = Math.hypot(dx, dz);
    const tangent: Vec2 = [dx / len, dz / len];
    const start = dot(reference.a, tangent),
      end = dot(reference.b, tangent);
    const p0 = dot(incident.a, tangent),
      p1 = dot(incident.b, tangent),
      delta = p1 - p0;
    let lo = 0,
      hi = 1;
    if (Math.abs(delta) < 1e-10) {
      if (p0 < start - padding || p0 > end + padding) hi = -1;
    } else {
      const ta = (start - padding - p0) / delta,
        tb = (end + padding - p0) / delta;
      lo = Math.max(0, Math.min(ta, tb));
      hi = Math.min(1, Math.max(ta, tb));
    }
    if (lo <= hi) {
      const out: Vec2[] = [];
      for (const t of [lo, hi]) {
        const p: Vec2 = [
          incident.a[0] + (incident.b[0] - incident.a[0]) * t,
          incident.a[1] + (incident.b[1] - incident.a[1]) * t,
        ];
        const separation = dot(
          [p[0] - reference.a[0], p[1] - reference.a[1]],
          reference.normal,
        );
        if (separation <= padding + 1e-6) {
          const point: Vec2 = [
            p[0] - (reference.normal[0] * separation) / 2,
            p[1] - (reference.normal[1] * separation) / 2,
          ];
          if (
            !out.length ||
            Math.hypot(point[0] - out[0][0], point[1] - out[0][1]) > 1e-5
          )
            out.push(point);
        }
      }
      if (out.length) return out;
    }
  }
  const ap = support(a, n, 1),
    bp = support(b, n, -1);
  return [[(ap[0] + bp[0]) / 2, (ap[1] + bp[1]) / 2]];
}
export function boatContact(
  a: BoatPose,
  b: BoatPose,
  padding = 0,
  budget?: ContactBudget,
): Contact | null {
  if (
    Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]) >
    2 * RADIUS + padding
  )
    return null;
  if (!spend(budget, 1)) return null;
  const av = boatHullPoints(a),
    bv = boatHullPoints(b),
    hit = sat(av, bv, padding);
  return hit
    ? { ...hit, points: contactPoints(av, bv, hit.normal, padding) }
    : null;
}
export function boundedBoatVelocity(v: number[]): Vec2 {
  const speed = Math.hypot(...v);
  if (!Number.isFinite(speed)) return [0, 0];
  const scale = speed > BOAT_MAX_SPEED ? BOAT_MAX_SPEED / speed : 1;
  return [v[0] * scale, v[1] * scale];
}
export function boundedBoatAngularVelocity(w: number) {
  return Number.isFinite(w)
    ? clamp(w, -BOAT_MAX_ANGULAR_SPEED, BOAT_MAX_ANGULAR_SPEED)
    : 0;
}
/** The new rotation state fits inside the bytes saved by rounding old float fields. */
export function quantizeBoatPose(boat: BoatPose): BoatPose {
  const q = (n: number) => Math.round(n * 1000) / 1000 || 0;
  return {
    position: [q(boat.position[0]), q(boat.position[1])],
    yaw: clamp(q(wrapBoatYaw(boat.yaw)), -3.141, 3.141),
    velocity: [q(boat.velocity[0]), q(boat.velocity[1])],
    ...(boat.angularVelocity === undefined
      ? {}
      : { angularVelocity: q(boat.angularVelocity) }),
    ...(boat.rudder === undefined || q(boat.rudder) === 0
      ? {}
      : { rudder: q(boat.rudder) }),
  };
}
function inertia(b: BoatBody) {
  return b.moored || b.rotationLocked ? 0 : 1 / BOAT_YAW_INERTIA;
}
function inverseMass(b: BoatBody) {
  return b.moored ? 0 : 1 / BOAT_MASS;
}
function pointVelocity(v: Vec2, w: number, r: Vec2): Vec2 {
  return [v[0] + w * r[1], v[1] - w * r[0]];
}
/** Contact-point sequential impulses. All position correction is split from velocity. */
export function resolveBoatImpact(
  a: BoatBody,
  b: BoatBody,
  padding = 0,
  restitution = true,
  budget?: ContactBudget,
) {
  const hit = boatContact(a, b, padding, budget);
  if (hit && !spend(budget, 4)) return null;
  return hit ? resolveBoatManifold(a, b, hit, restitution) : null;
}
export function resolveBoatWallImpact(
  body: BoatBody,
  point: Vec2,
  normal: Vec2,
): BoatBody {
  const wall: BoatBody = {
    position: point,
    yaw: 0,
    velocity: [0, 0],
    moored: true,
  };
  return (
    resolveBoatManifold(
      body,
      wall,
      { normal, points: [point], penetration: 0 },
      true,
    )?.a ?? body
  );
}
function resolveBoatManifold(
  a: BoatBody,
  b: BoatBody,
  hit: Contact,
  restitution: boolean,
) {
  const ia = inverseMass(a),
    ib = inverseMass(b),
    iiA = inertia(a),
    iiB = inertia(b);
  if (!hit || ia + ib === 0) return null;
  const n = hit.normal,
    t: Vec2 = [-n[1], n[0]];
  const av = a.moored ? ([0, 0] as Vec2) : boundedBoatVelocity(a.velocity),
    bv = b.moored ? ([0, 0] as Vec2) : boundedBoatVelocity(b.velocity);
  let aw = iiA ? boundedBoatAngularVelocity(a.angularVelocity ?? 0) : 0,
    bw = iiB ? boundedBoatAngularVelocity(b.angularVelocity ?? 0) : 0;
  let closingSpeed = 0;
  const contacts = hit.points.map((p) => {
    const ra: Vec2 = [p[0] - a.position[0], p[1] - a.position[1]],
      rb: Vec2 = [p[0] - b.position[0], p[1] - b.position[1]];
    const va = pointVelocity(av, aw, ra),
      vb = pointVelocity(bv, bw, rb),
      vn = dot([vb[0] - va[0], vb[1] - va[1]], n);
    closingSpeed = Math.max(closingSpeed, -vn);
    return {
      ra,
      rb,
      normalImpulse: 0,
      tangentImpulse: 0,
      bias: restitution && vn < -1 ? -0.05 * vn : 0,
    };
  });
  const impulse = (j: Vec2, ra: Vec2, rb: Vec2) => {
    av[0] -= j[0] * ia;
    av[1] -= j[1] * ia;
    bv[0] += j[0] * ib;
    bv[1] += j[1] * ib;
    aw -= cross(ra, j) * iiA;
    bw += cross(rb, j) * iiB;
  };
  const effective = (ra: Vec2, rb: Vec2, sa: Vec2, sb: Vec2) =>
    ia +
    ib +
    cross(ra, n) * cross(sa, n) * iiA +
    cross(rb, n) * cross(sb, n) * iiB;
  const relative = (ra: Vec2, rb: Vec2, axis: Vec2) => {
    const va = pointVelocity(av, aw, ra),
      vb = pointVelocity(bv, bw, rb);
    return dot([vb[0] - va[0], vb[1] - va[1]], axis);
  };
  const centreA: Vec2 = [
    contacts.reduce((s, c) => s + c.ra[0], 0) / contacts.length,
    contacts.reduce((s, c) => s + c.ra[1], 0) / contacts.length,
  ];
  const centreB: Vec2 = [
    contacts.reduce((s, c) => s + c.rb[0], 0) / contacts.length,
    contacts.reduce((s, c) => s + c.rb[1], 0) / contacts.length,
  ];
  let tangentImpulse = 0;
  for (let iteration = 0; iteration < CONTACT_ITERATIONS; iteration++) {
    let blockSolved = false;
    if (contacts.length === 2) {
      const [c, d] = contacts;
      const k11 = effective(c.ra, c.rb, c.ra, c.rb),
        k22 = effective(d.ra, d.rb, d.ra, d.rb),
        k12 = effective(c.ra, c.rb, d.ra, d.rb),
        det = k11 * k22 - k12 * k12;
      if (det > 1e-12) {
        const b1 =
          relative(c.ra, c.rb, n) -
          c.bias -
          k11 * c.normalImpulse -
          k12 * d.normalImpulse;
        const b2 =
          relative(d.ra, d.rb, n) -
          d.bias -
          k12 * c.normalImpulse -
          k22 * d.normalImpulse;
        let x = -(k22 * b1 - k12 * b2) / det,
          y = -(k11 * b2 - k12 * b1) / det;
        if (x < 0 || y < 0) {
          x = Math.max(0, -b1 / k11);
          y = 0;
          if (b2 + k12 * x < -1e-8) {
            x = 0;
            y = Math.max(0, -b2 / k22);
          }
          if (b1 + k12 * y < -1e-8 && x === 0) {
            x = 0;
            y = 0;
          }
        }
        const j = x - c.normalImpulse,
          j2 = y - d.normalImpulse;
        impulse([n[0] * j, n[1] * j], c.ra, c.rb);
        impulse([n[0] * j2, n[1] * j2], d.ra, d.rb);
        c.normalImpulse = x;
        d.normalImpulse = y;
        blockSolved = true;
      }
    }
    if (!blockSolved)
      for (const c of contacts) {
        const k = effective(c.ra, c.rb, c.ra, c.rb),
          old = c.normalImpulse;
        c.normalImpulse = Math.max(
          0,
          old + (c.bias - relative(c.ra, c.rb, n)) / k,
        );
        const j = c.normalImpulse - old;
        impulse([n[0] * j, n[1] * j], c.ra, c.rb);
      }
    // One friction patch at the manifold centre avoids endpoint ordering bias.
    const kt =
      ia + ib + cross(centreA, t) ** 2 * iiA + cross(centreB, t) ** 2 * iiB;
    const limit = 0.12 * contacts.reduce((s, c) => s + c.normalImpulse, 0),
      old = tangentImpulse;
    tangentImpulse = clamp(
      old - relative(centreA, centreB, t) / kt,
      -limit,
      limit,
    );
    const jt = tangentImpulse - old;
    impulse([t[0] * jt, t[1] * jt], centreA, centreB);
  }
  const correction = Math.min(hit.penetration + SKIN, 1),
    sum = ia + ib;
  const moved = (
    body: BoatBody,
    v: Vec2,
    w: number,
    inv: number,
    sign: number,
  ): BoatBody => ({
    ...body,
    position: [
      body.position[0] + (sign * n[0] * correction * inv) / sum,
      body.position[1] + (sign * n[1] * correction * inv) / sum,
    ],
    velocity: boundedBoatVelocity(v),
    ...(body.rotationLocked
      ? {}
      : { angularVelocity: boundedBoatAngularVelocity(w) }),
  });
  return {
    a: moved(a, av, aw, ia, -1),
    b: moved(b, bv, bw, ib, 1),
    closingSpeed,
    contact: hit,
  };
}
export function interpolateBoat(a: BoatBody, b: BoatBody, t: number): BoatBody {
  return {
    ...b,
    position: [
      a.position[0] + (b.position[0] - a.position[0]) * t,
      a.position[1] + (b.position[1] - a.position[1]) * t,
    ],
    yaw: a.yaw + wrapBoatYaw(b.yaw - a.yaw) * t,
  };
}
export function integrateBoat(body: BoatBody, seconds: number): BoatBody {
  if (body.moored) return body;
  return {
    ...body,
    position: [
      body.position[0] + body.velocity[0] * seconds,
      body.position[1] + body.velocity[1] * seconds,
    ],
    yaw: wrapBoatYaw(body.yaw + (body.angularVelocity ?? 0) * seconds),
  };
}
/** Conservative swept sampling, including the angular travel of every hull point. */
export function sweepBoatImpact(
  fromA: BoatBody,
  toA: BoatBody,
  fromB: BoatBody,
  toB: BoatBody,
  budget?: ContactBudget,
) {
  const travel = (a: BoatBody, b: BoatBody) =>
    Math.hypot(b.position[0] - a.position[0], b.position[1] - a.position[1]) +
    RADIUS * Math.abs(wrapBoatYaw(b.yaw - a.yaw));
  const distance = travel(fromA, toA) + travel(fromB, toB),
    steps = Math.min(128, Math.max(1, Math.ceil(distance / 0.1))),
    padding = distance / (2 * steps);
  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps,
      a = interpolateBoat(fromA, toA, fraction),
      b = interpolateBoat(fromB, toB, fraction);
    const hit = resolveBoatImpact(a, b, padding, true, budget);
    if (budget?.exhausted) return null;
    if (hit && (hit.closingSpeed > 0.01 || boatContact(a, b, 0, budget)))
      return { ...hit, fraction };
  }
  return null;
}
/** A bounded continuous contact island. Unrelated boats never receive corrections. */
export function solveBoatContactIsland(
  from: BoatBody[],
  to: BoatBody[],
  seconds: number,
  driver: number,
) {
  let current = from.map((b) => ({ ...b })),
    targets = to.map((b) => ({ ...b })),
    remaining = seconds;
  const budget: ContactBudget = {
    remaining: BOAT_CONTACT_WORK_LIMIT,
    used: 0,
    exhausted: false,
  };
  const changed = new Set<number>(),
    active = new Set([driver]),
    ignored = new Set<string>();
  for (let event = 0; event < 8 && remaining > 1e-6; event++) {
    let best: {
      i: number;
      j: number;
      hit: NonNullable<ReturnType<typeof sweepBoatImpact>>;
    } | null = null;
    for (const i of active)
      for (let j = 0; j < current.length; j++) {
        if (
          i === j ||
          (active.has(j) && j < i) ||
          (current[i].moored && current[j].moored)
        )
          continue;
        const reach =
          2 * RADIUS +
          Math.hypot(
            targets[i].position[0] - current[i].position[0],
            targets[i].position[1] - current[i].position[1],
          ) +
          Math.hypot(
            targets[j].position[0] - current[j].position[0],
            targets[j].position[1] - current[j].position[1],
          );
        if (
          Math.hypot(
            current[i].position[0] - current[j].position[0],
            current[i].position[1] - current[j].position[1],
          ) > reach
        )
          continue;
        if (ignored.has(`${Math.min(i, j)}:${Math.max(i, j)}`)) continue;
        const hit = sweepBoatImpact(
          current[i],
          targets[i],
          current[j],
          targets[j],
          budget,
        );
        if (budget.exhausted) break;
        if (hit && (!best || hit.fraction < best.hit.fraction))
          best = { i, j, hit };
      }
    if (budget.exhausted || !best) break;
    const { i, j, hit } = best;
    current = current.map((b, k) =>
      interpolateBoat(b, targets[k], hit.fraction),
    );
    remaining *= 1 - hit.fraction;
    current[i] = hit.a;
    current[j] = hit.b;
    for (const k of [i, j]) {
      changed.add(k);
      active.add(k);
      targets[k] = integrateBoat(current[k], remaining);
    }
    for (const key of [...ignored])
      if (key.split(":").some((k) => Number(k) === i || Number(k) === j))
        ignored.delete(key);
    ignored.add(`${Math.min(i, j)}:${Math.max(i, j)}`);
  }
  // Only contact islands need stabilization; distant/unrelated pairs do no work.
  if (changed.size)
    for (let pass = 0; pass < 6; pass++) {
      let touched = false;
      for (const i of active)
        for (let j = 0; j < targets.length; j++) {
          if (
            i === j ||
            (active.has(j) && j < i) ||
            (targets[i].moored && targets[j].moored)
          )
            continue;
          if (budget.exhausted) break;
          const hit = resolveBoatImpact(
            targets[i],
            targets[j],
            0,
            false,
            budget,
          );
          if (hit) {
            if (!active.has(j) && active.size >= BOAT_MAX_CONTACT_ISLAND) {
              budget.exhausted = true;
              break;
            }
            targets[i] = hit.a;
            targets[j] = hit.b;
            changed.add(i);
            changed.add(j);
            active.add(j);
            touched = true;
          }
        }
      if (!touched) break;
    }
  if (budget.exhausted) {
    // Overlapping/hostile piles must not consume unbounded worker CPU or
    // tunnel unchecked. Brake the affected island at its last safe state.
    for (const i of active)
      if (!current[i].moored) {
        targets[i] = {
          ...current[i],
          velocity: [0, 0],
          ...(current[i].rotationLocked ? {} : { angularVelocity: 0 }),
        };
        changed.add(i);
      }
  }
  return {
    bodies: targets,
    changed,
    workUnits: budget.used,
    budgetLimited: budget.exhausted,
  };
}
