import { describe, expect, it } from "vitest";
import {
  boatContact,
  boundedBoatVelocity,
  resolveBoatImpact,
  sweepBoatImpact,
  BOAT_MAX_SPEED,
  type BoatBody,
} from "../../../packages/shared/boats";
import {
  advanceBoat,
  applyBoatImpact,
  boatVelocity,
  createBoatMotionState,
} from "./boat-motion";

const boat = (
  x: number,
  z: number,
  vx = 0,
  vz = 0,
  yaw = 0,
  moored = false,
): BoatBody => ({ position: [x, z], velocity: [vx, vz], yaw, moored });
const energy = (...b: BoatBody[]) =>
  b.reduce((sum, b) => sum + b.velocity[0] ** 2 + b.velocity[1] ** 2, 0);
describe("damped boat impacts", () => {
  it("does not create kinetic energy across varied hull angles and contacts", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    let contacts = 0;
    for (let i = 0; i < 1000; i++) {
      const a = boat(0, 0, 0, 0, random() * Math.PI * 2);
      const b = boat(
        (random() - 0.5) * 4,
        (random() - 0.5) * 5,
        0,
        0,
        random() * Math.PI * 2,
      );
      a.velocity = boundedBoatVelocity([
        (random() - 0.5) * 25.6,
        (random() - 0.5) * 25.6,
      ]);
      b.velocity = boundedBoatVelocity([
        (random() - 0.5) * 25.6,
        (random() - 0.5) * 25.6,
      ]);
      const hit = resolveBoatImpact(a, b);
      if (hit) {
        contacts++;
        expect(energy(hit.a, hit.b)).toBeLessThanOrEqual(energy(a, b) + 1e-8);
      }
    }
    expect(contacts).toBeGreaterThan(500);
  });
  it("reverse impacts push another occupied hull astern", () => {
    const hit = resolveBoatImpact(boat(0, 0, 0, -2), boat(0, -6))!;
    expect(hit.b.velocity[1]).toBeCloseTo(-1.05);
    expect(hit.a.velocity[1]).toBeCloseTo(-0.95);
  });
  it("head-on occupied boats stop most forward motion without gaining energy", () => {
    const a = boat(0, 0, 0, 8),
      b = boat(0, 7, 0, -8, Math.PI);
    const hit = resolveBoatImpact(a, b)!;
    expect(hit).not.toBeNull();
    expect(Math.abs(hit.a.velocity[1])).toBeLessThan(0.5);
    expect(Math.abs(hit.b.velocity[1])).toBeLessThan(0.5);
    expect(hit.a.velocity[1] + hit.b.velocity[1]).toBeCloseTo(0);
    expect(energy(hit.a, hit.b)).toBeLessThan(energy(a, b));
    expect(boatContact(hit.a, hit.b)).toBeNull();
  });
  it("a rear impact moves the stopped occupied boat ahead", () => {
    const a = boat(0, 0, 0, 8),
      b = boat(0, 6, 0, 0);
    const hit = resolveBoatImpact(a, b)!;
    expect(hit.b.velocity[1]).toBeCloseTo(4.2);
    expect(hit.a.velocity[1]).toBeCloseTo(3.8);
    expect(energy(hit.a, hit.b)).toBeLessThan(energy(a, b));
  });
  it("glancing hulls slide with bounded tangential friction", () => {
    const a = boat(0, 0, 4, 6),
      b = boat(2.1, 0, 0, 0);
    const hit = resolveBoatImpact(a, b)!;
    expect(hit.a.velocity[1]).toBeGreaterThan(5);
    expect(hit.b.velocity[0]).toBeGreaterThan(0);
    expect(energy(hit.a, hit.b)).toBeLessThanOrEqual(energy(a, b));
  });
  it("moored boats remain in place and only the moving driver responds", () => {
    const a = boat(0, 0, 0, 8),
      b = boat(0, 6, 0, 0, 0, true);
    const hit = resolveBoatImpact(a, b)!;
    expect(hit.b.position).toEqual(b.position);
    expect(hit.b.velocity).toEqual([0, 0]);
    expect(hit.a.velocity[1]).toBeCloseTo(-0.4);
  });
  it("does not collide moored hulls with one another or distant boats", () => {
    expect(
      resolveBoatImpact(boat(0, 0, 0, 0, 0, true), boat(0, 0, 0, 0, 0, true)),
    ).toBeNull();
    expect(resolveBoatImpact(boat(0, 0), boat(100, 100))).toBeNull();
  });
  it("catches a boosted crossing even when endpoint hulls are separated", () => {
    const from = boat(0, -5, 0, 12.8),
      to = boat(0, 5, 0, 12.8);
    const other = boat(0, 0, 0, 0, Math.PI / 2);
    expect(boatContact(from, other)).toBeNull();
    expect(boatContact(to, other)).toBeNull();
    const hit = sweepBoatImpact(from, to, other, other)!;
    expect(hit.fraction).toBeLessThan(1);
    expect(hit.b.velocity[1]).toBeGreaterThan(0);
  });
  it("does not catch and rewind boats already moving apart", () => {
    const a = boat(0, 0, 0, -1),
      b = boat(0, 6.18, 0, 1);
    expect(
      sweepBoatImpact(a, boat(0, -0.1, 0, -1), b, boat(0, 6.28, 0, 1)),
    ).toBeNull();
  });
  it("keeps repeated contact finite, bounded and non-energizing", () => {
    let a = boat(0, 0, 0, 12.8),
      b = boat(2, 0, -12.8, 0);
    for (let i = 0; i < 100; i++) {
      const before = energy(a, b),
        hit = resolveBoatImpact(a, b);
      if (!hit) break;
      expect(energy(hit.a, hit.b)).toBeLessThanOrEqual(before + 1e-8);
      for (const body of [hit.a, hit.b]) {
        expect(Math.hypot(...body.velocity)).toBeLessThanOrEqual(
          BOAT_MAX_SPEED + 1e-8,
        );
        expect(
          [...body.position, ...body.velocity].every(Number.isFinite),
        ).toBe(true);
      }
      a = hit.a;
      b = hit.b;
    }
  });
  it("settles sideways momentum through water drag while retaining the float", () => {
    const state = createBoatMotionState(0);
    applyBoatImpact(state, boat(2, 2, 4, 3));
    const first = boatVelocity({
      yaw: state.yaw,
      speed: state.speed,
      velocityY: 0.15,
      bodyY: 0.8,
      time: 0,
      dt: 1 / 60,
      driftX: state.driftX,
      driftZ: state.driftZ,
    });
    expect(first.x).toBeCloseTo(4);
    for (let i = 0; i < 120; i++)
      advanceBoat(state, { throttle: 0, steer: 0, dt: 1 / 60 });
    expect(Math.abs(state.driftX)).toBeLessThan(0.03);
    const plain = boatVelocity({
      yaw: 0,
      speed: 0,
      velocityY: 0.15,
      bodyY: 0.8,
      time: 0,
      dt: 1 / 60,
    });
    expect(first.y).toBe(plain.y);
  });
});
