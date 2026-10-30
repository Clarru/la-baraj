import { describe, expect, it } from "vitest";
import {
  BOAT_MASS as MASS,
  BOAT_YAW_INERTIA as INERTIA,
  BOAT_MAX_ANGULAR_SPEED,
  BOAT_CONTACT_WORK_LIMIT,
  boatContact,
  resolveBoatImpact,
  resolveBoatWallImpact,
  solveBoatContactIsland,
  quantizeBoatPose,
  type BoatBody,
} from "../../../packages/shared/boats";
import {
  advanceBoat,
  applyBoatImpact,
  boatVelocity,
  createBoatMotionState,
} from "./boat-motion";
const boat = (x = 0, z = 0, vx = 0, vz = 0, yaw = 0, w = 0): BoatBody => ({
  position: [x, z],
  velocity: [vx, vz],
  yaw,
  angularVelocity: w,
  rudder: 0,
  moored: false,
});
const energy = (b: BoatBody) =>
  0.5 * MASS * (b.velocity[0] ** 2 + b.velocity[1] ** 2) +
  0.5 * INERTIA * (b.angularVelocity ?? 0) ** 2;
const momentum = (b: BoatBody) => b.velocity.map((v) => v * MASS);
const angularMomentum = (b: BoatBody, position = b.position) =>
  MASS * (position[1] * b.velocity[0] - position[0] * b.velocity[1]) +
  INERTIA * (b.angularVelocity ?? 0);
describe("surface rigid-body contacts", () => {
  it("centred head-on contact sheds speed without inventing sideways motion or spin", () => {
    const a = boat(0, 0, 0, 8),
      b = boat(0, 7, 0, -8, Math.PI),
      hit = resolveBoatImpact(a, b)!;
    for (const result of [hit.a, hit.b]) {
      expect(Math.abs(result.velocity[1])).toBeLessThan(0.5);
      expect(result.velocity[0]).toBeCloseTo(0, 8);
      expect(result.angularVelocity).toBeCloseTo(0, 8);
    }
  });
  it("a centred rear contact transfers momentum without spinning either boat", () => {
    const hit = resolveBoatImpact(boat(0, 0, 0, 8), boat(0, 6))!;
    expect(hit.a.velocity[1]).toBeCloseTo(3.8);
    expect(hit.b.velocity[1]).toBeCloseTo(4.2);
    expect(hit.a.angularVelocity).toBeCloseTo(0, 8);
    expect(hit.b.angularVelocity).toBeCloseTo(0, 8);
  });
  it("bow and stern lever arms produce opposite yaw impulses", () => {
    const target = boat(0, 0, 3, 0);
    const bow = resolveBoatWallImpact(target, [0.7, 2], [1, 0]);
    const stern = resolveBoatWallImpact(target, [0.7, -2], [1, 0]);
    expect(bow.angularVelocity!).toBeLessThan(0);
    expect(stern.angularVelocity!).toBeGreaterThan(0);
    expect(Math.abs(bow.angularVelocity!)).toBeCloseTo(
      Math.abs(stern.angularVelocity!),
      7,
    );
  });
  it("off-centre boat contact conserves impulse momentum and yaw angular momentum", () => {
    const a = boat(0, 0, 0, 0),
      b = boat(1.3, 4.2, -3, 0),
      hit = resolveBoatImpact(a, b)!;
    expect(hit).not.toBeNull();
    expect(
      Math.abs(hit.a.angularVelocity!) + Math.abs(hit.b.angularVelocity!),
    ).toBeGreaterThan(0.1);
    const before = momentum(a).map((v, i) => v + momentum(b)[i]);
    const after = momentum(hit.a).map((v, i) => v + momentum(hit.b)[i]);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
    // Position projection is split from the velocity solver. Verify impulse
    // angular momentum at the pre-projection mass centres.
    expect(
      angularMomentum(hit.a, a.position) + angularMomentum(hit.b, b.position),
    ).toBeCloseTo(angularMomentum(a) + angularMomentum(b), 6);
    expect(energy(hit.a) + energy(hit.b)).toBeLessThanOrEqual(
      energy(a) + energy(b) + 1e-6,
    );
  });
  it("mirrored off-centre contacts mirror their yaw response", () => {
    const left = resolveBoatImpact(boat(), boat(1.3, 4.2, -3, 0))!;
    const right = resolveBoatImpact(boat(), boat(-1.3, 4.2, 3, 0))!;
    expect(left.a.angularVelocity).toBeCloseTo(-right.a.angularVelocity!, 6);
    expect(left.b.angularVelocity).toBeCloseTo(-right.b.angularVelocity!, 6);
  });
  it("includes velocity at the contact point when a spinning boat hits", () => {
    const spinning = boat(0, 0, 0, 0, 0, 1);
    const hit = resolveBoatWallImpact(spinning, [1, 2], [1, 0]);
    expect(Math.abs(hit.angularVelocity!)).toBeLessThan(1);
    expect(hit.velocity[0]).toBeLessThan(0);
    expect(energy(hit)).toBeLessThanOrEqual(energy(spinning) + 1e-6);
  });
  it("low-speed rubbing has no restitution and cannot acquire kinetic energy", () => {
    const a = boat(0, 0, 0, 0.2),
      b = boat(0, 6),
      hit = resolveBoatImpact(a, b)!;
    expect(hit.a.velocity[1]).toBeCloseTo(0.1, 6);
    expect(hit.b.velocity[1]).toBeCloseTo(0.1, 6);
    expect(energy(hit.a) + energy(hit.b)).toBeLessThan(energy(a));
  });
  it("keeps moored boats fixed and legacy hulls rotation-locked", () => {
    const moored = { ...boat(0, 6), moored: true };
    const hit = resolveBoatImpact(boat(0.5, 0, 0, 4), moored)!;
    expect(hit.b.position).toEqual(moored.position);
    expect(hit.b.velocity).toEqual([0, 0]);
    expect(hit.b.angularVelocity).toBe(0);
    const legacy = { ...boat(1.3, 4.2, -3, 0), rotationLocked: true };
    delete legacy.angularVelocity;
    const mixed = resolveBoatImpact(boat(), legacy)!;
    expect(mixed.b.angularVelocity).toBeUndefined();
    expect(Math.abs(mixed.a.angularVelocity!)).toBeGreaterThan(0);
  });
  it("transfers a rear hit through a three-boat contact island", () => {
    const from = [boat(0, 0, 0, 8), boat(0, 6.4), boat(0, 12.8)],
      to = [boat(0, 1.6, 0, 8), from[1], from[2]];
    const result = solveBoatContactIsland(from, to, 0.2, 0);
    expect([...result.changed].sort()).toEqual([0, 1, 2]);
    expect(result.bodies[2].velocity[1]).toBeGreaterThan(1);
    for (const b of result.bodies)
      expect(Math.abs(b.angularVelocity ?? 0)).toBeLessThanOrEqual(
        BOAT_MAX_ANGULAR_SPEED,
      );
    expect(
      result.bodies.reduce((s, b) => s + energy(b), 0),
    ).toBeLessThanOrEqual(from.reduce((s, b) => s + energy(b), 0) + 1e-5);
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++)
        expect(boatContact(result.bodies[i], result.bodies[j])).toBeNull();
  });
  it("does not add linear or rotational energy across varied contacts", () => {
    let seed = 17;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    let count = 0;
    for (let i = 0; i < 2000; i++) {
      const a = boat(
        0,
        0,
        (random() - 0.5) * 12,
        (random() - 0.5) * 12,
        random() * 6.28,
        (random() - 0.5) * 2,
      );
      const b = boat(
        (random() - 0.5) * 4,
        (random() - 0.5) * 6,
        (random() - 0.5) * 12,
        (random() - 0.5) * 12,
        random() * 6.28,
        (random() - 0.5) * 2,
      );
      const hit = resolveBoatImpact(a, b);
      if (hit) {
        count++;
        expect(energy(hit.a) + energy(hit.b)).toBeLessThanOrEqual(
          energy(a) + energy(b) + 1e-5,
        );
      }
    }
    expect(count).toBeGreaterThan(1500);
  });
  it("quantization is idempotent including the yaw seam and preserves small state", () => {
    const original = boat(
      12.123456,
      -30.123456,
      4.123456,
      2.123456,
      Math.PI,
      0.123456,
    );
    original.rudder = 0.345678;
    const q = quantizeBoatPose(original);
    expect(quantizeBoatPose(q)).toEqual(q);
    expect(Math.abs(q.position[0] - original.position[0])).toBeLessThan(0.001);
    expect(
      Math.abs(q.angularVelocity! - original.angularVelocity!),
    ).toBeLessThan(0.001);
  });
  it("handles a packed 50-boat scene within its work budget and brakes an invalid overlap pile", () => {
    const make = (sx: number, sz: number) =>
      Array.from({ length: 50 }, (_, i) =>
        boat((i % 5) * sx, Math.floor(i / 5) * sz),
      );
    const packed = make(2.25, 6.3);
    packed[0].velocity = [3, 10];
    const to = packed.map((b, i) =>
      i === 0 ? { ...b, position: [0.6, 2] as [number, number] } : b,
    );
    const normal = solveBoatContactIsland(packed, to, 0.2, 0);
    expect(normal.budgetLimited).toBe(false);
    expect(normal.workUnits).toBeLessThanOrEqual(BOAT_CONTACT_WORK_LIMIT);
    const pile = make(1.5, 3);
    pile[0].velocity = [3, 10];
    const overloaded = solveBoatContactIsland(
      pile,
      pile.map((b, i) =>
        i === 0 ? { ...b, position: [0.6, 2] as [number, number] } : b,
      ),
      0.2,
      0,
    );
    expect(overloaded.budgetLimited).toBe(true);
    expect(overloaded.workUnits).toBeLessThanOrEqual(BOAT_CONTACT_WORK_LIMIT);
    for (const i of overloaded.changed) {
      expect(overloaded.bodies[i].velocity).toEqual([0, 0]);
      expect(overloaded.bodies[i].angularVelocity).toBe(0);
    }
  });
  it("passes an impact through six aligned occupied boats without an energetic pile-up", () => {
    const from = Array.from({ length: 6 }, (_, i) =>
      boat(0, i * 6.3, 0, i === 0 ? 12.8 : 0),
    );
    const result = solveBoatContactIsland(
      from,
      from.map((b, i) =>
        i === 0 ? { ...b, position: [0, 2.56] as [number, number] } : b,
      ),
      0.2,
      0,
    );
    expect(result.budgetLimited).toBe(false);
    expect(result.bodies[5].velocity[1]).toBeGreaterThan(0);
    expect(result.bodies.reduce((s, b) => s + energy(b), 0)).toBeLessThan(
      from.reduce((s, b) => s + energy(b), 0),
    );
    for (let i = 1; i < 6; i++)
      expect(
        boatContact(result.bodies[i - 1], result.bodies[i])?.penetration ?? 0,
      ).toBeLessThan(0.025);
  });
});
describe("rotational handling and water resistance", () => {
  it("coasting through a turn does not gain linear plus rotational energy", () => {
    const state = createBoatMotionState(0);
    state.speed = 8;
    const stateEnergy = () =>
      0.5 *
        MASS *
        ((Math.sin(state.yaw) * state.speed + state.driftX) ** 2 +
          (Math.cos(state.yaw) * state.speed + state.driftZ) ** 2) +
      0.5 * INERTIA * state.turnRate ** 2;
    for (let i = 0; i < 600; i++) {
      const before = stateEnergy();
      advanceBoat(state, { throttle: 0, steer: 1, dt: 1 / 60 });
      expect(stateEnergy()).toBeLessThanOrEqual(before + 1e-6);
    }
  });
  it("a collision starts a damped yaw drift without turning the helm wheel", () => {
    const state = createBoatMotionState(0);
    applyBoatImpact(state, {
      position: [0, 0],
      yaw: 0,
      velocity: [0, 0],
      angularVelocity: 1,
      rudder: 0,
    });
    advanceBoat(state, { throttle: 0, steer: 0, dt: 1 / 60 });
    expect(state.yaw).toBeGreaterThan(0);
    expect(state.wheelAngle).toBe(0);
    for (let i = 0; i < 180; i++)
      advanceBoat(state, { throttle: 0, steer: 0, dt: 1 / 60 });
    expect(Math.abs(state.turnRate)).toBeLessThan(0.001);
    expect(state.yaw).toBeLessThan(0.4);
  });
  it("turning preserves world momentum and then damps lateral slip", () => {
    const state = createBoatMotionState(0);
    state.speed = 8;
    state.steer = 1;
    state.turnRate = 0.9;
    advanceBoat(state, { throttle: 0, steer: 1, dt: 1 / 60 });
    const v = boatVelocity({
      yaw: state.yaw,
      speed: state.speed,
      driftX: state.driftX,
      driftZ: state.driftZ,
      velocityY: 0,
      bodyY: 0.8,
      time: 0,
      dt: 1 / 60,
    });
    expect(Math.hypot(v.x, v.z)).toBeLessThan(8);
    expect(Math.abs(v.x)).toBeLessThan(
      Math.abs(Math.sin(state.yaw) * state.speed),
    );
    expect(Math.hypot(state.driftX, state.driftZ)).toBeGreaterThan(0);
  });
});
