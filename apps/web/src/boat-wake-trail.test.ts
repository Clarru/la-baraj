import { describe, expect, it } from "vitest";
import { BOAT_DIMENSIONS } from "./boat-geometry";
import {
  WAKE_ACROSS,
  WAKE_FADE_SECONDS,
  WAKE_RESET_DISTANCE,
  WAKE_STRIPS,
  WAKE_TRAIL_SAMPLES,
  WAKE_VERTEX_COUNT,
  clearWakeTrail,
  createWakeTrail,
  layoutWakeRibbon,
  pruneWakeTrail,
  pushWakeSample,
  wakeRibbonIndex,
} from "./boat-wake-trail";

const buffers = () => ({
  positions: new Float32Array(WAKE_VERTEX_COUNT * 3),
  aux: new Float32Array(WAKE_VERTEX_COUNT * 3),
  bounds: new Float32Array(3),
});
const vertex = (slot: number, arm: number, across: number) =>
  (arm * WAKE_TRAIL_SAMPLES + slot) * WAKE_ACROSS + across;

describe("wake trail buffer", () => {
  it("appends by distance or time", () => {
    const trail = createWakeTrail();
    expect(pushWakeSample(trail, 0, 0, 0, 1, 1)).toBe(true);
    expect(pushWakeSample(trail, 0.1, 0, 0.05, 1, 1)).toBe(false);
    expect(trail.data[trail.head * 5]).toBeCloseTo(0.1);
    expect(trail.count).toBe(1);
    expect(pushWakeSample(trail, 0.5, 0, 0.06, 1, 1)).toBe(true);
    expect(pushWakeSample(trail, 0.5, 0.01, 0.3, 1, 1)).toBe(true);
    expect(trail.count).toBe(3);
  });

  it("ring wraps without growing", () => {
    const trail = createWakeTrail();
    const length = trail.data.length;
    for (let i = 0; i < WAKE_TRAIL_SAMPLES + 10; i++)
      pushWakeSample(trail, i, 0, i * 0.01, 1, 1);
    expect(trail.count).toBe(WAKE_TRAIL_SAMPLES);
    expect(trail.data.length).toBe(length);
  });

  it("fades out all samples after WAKE_FADE_SECONDS", () => {
    const trail = createWakeTrail();
    for (let i = 0; i < 5; i++) pushWakeSample(trail, i, 0, i * 0.5, 1, 1);
    expect(pruneWakeTrail(trail, 2 + WAKE_FADE_SECONDS + 0.01)).toBe(0);
    const { positions, aux, bounds } = buffers();
    expect(layoutWakeRibbon(trail, 9, 0, positions, aux, bounds)).toBe(0);
    expect(bounds[2]).toBeGreaterThanOrEqual(0);
  });

  it("clears the trail on a jump longer than WAKE_RESET_DISTANCE", () => {
    const trail = createWakeTrail();
    for (let i = 0; i < 3; i++) pushWakeSample(trail, i, 0, i, 1, 1);
    const far = 2 + WAKE_RESET_DISTANCE + 1;
    expect(pushWakeSample(trail, far, 0, 3, 1, 1)).toBe(true);
    expect(trail.count).toBe(1);
    expect(trail.data[trail.head * 5]).toBe(far);
  });

  it("ignores non-finite samples", () => {
    const trail = createWakeTrail();
    pushWakeSample(trail, 0, 0, 0, 1, 1);
    for (const args of [
      [NaN, 0, 1],
      [0, Infinity, 1],
      [1, 1, NaN],
      [1, 1, Infinity],
    ] as const)
      expect(pushWakeSample(trail, args[0], args[1], args[2], 1, 1)).toBe(
        false,
      );
    expect(trail.count).toBe(1);
    expect(trail.data.every(Number.isFinite)).toBe(true);
  });

  it("clearWakeTrail empties the trail", () => {
    const trail = createWakeTrail();
    pushWakeSample(trail, 0, 0, 0, 1, 1);
    clearWakeTrail(trail);
    expect(trail.count).toBe(0);
  });
});

describe("wake ribbon layout", () => {
  it("lays out a straight run as a symmetric V", () => {
    const trail = createWakeTrail();
    for (let i = 0; i < 10; i++) pushWakeSample(trail, 0, i, i * 0.1, 4, 1);
    const { positions, aux, bounds } = buffers();
    expect(layoutWakeRibbon(trail, 0.9, 0.2, positions, aux, bounds)).toBe(10);
    let lastHalf = -1;
    for (let slot = 0; slot < 10; slot++) {
      const port = positions[vertex(slot, 0, 1) * 3];
      const star = positions[vertex(slot, 2, 1) * 3];
      const centre = positions[vertex(slot, 1, 1) * 3];
      expect(port).toBeCloseTo(-star, 5);
      expect(centre).toBeCloseTo(0, 5);
      const half = Math.abs(star);
      expect(half).toBeGreaterThanOrEqual(lastHalf - 1e-6);
      lastHalf = half;
    }
    expect(aux[vertex(0, 1, 1) * 3]).toBeCloseTo(0, 5);
    let lastAlong = -1;
    for (let slot = 0; slot < 10; slot++) {
      const along = aux[vertex(slot, 1, 1) * 3];
      expect(along).toBeGreaterThan(lastAlong);
      expect(along).toBeLessThanOrEqual(1);
      lastAlong = along;
    }
    for (let v = 0; v < WAKE_VERTEX_COUNT; v++)
      expect(positions[v * 3 + 1]).toBeCloseTo(0.2, 6);
    expect(bounds[1]).toBeCloseTo(4.5, 5);
  });

  it("bends through a turn", () => {
    const trail = createWakeTrail();
    const r = 10;
    const n = 20;
    const pt = (k: number) => {
      const a = (k / (n - 1)) * (Math.PI / 2);
      return [r * Math.sin(a), r * (1 - Math.cos(a))];
    };
    for (let k = 0; k < n; k++) {
      const [x, z] = pt(k);
      pushWakeSample(trail, x, z, k * 0.05, 3, 1);
    }
    const { positions, aux, bounds } = buffers();
    layoutWakeRibbon(trail, 1, 0, positions, aux, bounds);
    // slot s holds sample n-1-s; mid-trail
    const s = 9;
    const k = n - 1 - s;
    const [px, pz] = pt(k - 1);
    const [nx, nz] = pt(k + 1);
    const [cx, cz] = pt(k);
    let tx = nx - px;
    let tz = nz - pz;
    const len = Math.hypot(tx, tz);
    tx /= len;
    tz /= len;
    for (const arm of [0, 2]) {
      const ox = positions[vertex(s, arm, 1) * 3] - cx;
      const oz = positions[vertex(s, arm, 1) * 3 + 2] - cz;
      expect(ox * tx + oz * tz).toBeCloseTo(0, 3);
      expect(Math.hypot(ox, oz)).toBeGreaterThan(0.5);
    }
  });

  it("collapses unused vertices onto the head with zero along", () => {
    const trail = createWakeTrail();
    pushWakeSample(trail, 1, 2, 0, 3, 1);
    pushWakeSample(trail, 1, 3, 0.2, 3, 1);
    const { positions, aux, bounds } = buffers();
    expect(layoutWakeRibbon(trail, 0.2, 0.5, positions, aux, bounds)).toBe(2);
    for (let arm = 0; arm < WAKE_STRIPS; arm++)
      for (let slot = 2; slot < WAKE_TRAIL_SAMPLES; slot++)
        for (let across = 0; across < WAKE_ACROSS; across++) {
          const v = vertex(slot, arm, across);
          expect(positions[v * 3]).toBe(Math.fround(1));
          expect(positions[v * 3 + 1]).toBe(0.5);
          expect(positions[v * 3 + 2]).toBe(Math.fround(3));
          expect(aux[v * 3]).toBe(0);
          expect(aux[v * 3 + 1]).toBe(0);
        }
  });

  it("weak samples fade toward 1 and aux carries across and arm", () => {
    const trail = createWakeTrail();
    pushWakeSample(trail, 0, 0, 0, 2, 0);
    pushWakeSample(trail, 0, 1, 0.1, 2, 0);
    const { positions, aux, bounds } = buffers();
    layoutWakeRibbon(trail, 0.1, 0, positions, aux, bounds);
    expect(aux[vertex(1, 1, 1) * 3]).toBe(1);
    expect(aux[vertex(0, 2, 2) * 3 + 1]).toBe(1);
    expect(aux[vertex(0, 2, 2) * 3 + 2]).toBe(1);
    expect(aux[vertex(0, 0, 0) * 3 + 1]).toBe(-1);
    expect(aux[vertex(0, 0, 0) * 3 + 2]).toBe(-1);
  });

  it("never allocates during push, prune or layout", () => {
    const trail = createWakeTrail();
    const { positions, aux, bounds } = buffers();
    const Original = Float32Array;
    let constructed = 0;
    globalThis.Float32Array = new Proxy(Original, {
      construct(t, a) {
        constructed++;
        return Reflect.construct(t, a);
      },
    }) as typeof Float32Array;
    try {
      for (let i = 0; i < 20; i++) {
        pushWakeSample(trail, i, 0, i * 0.1, 2, 1);
        pruneWakeTrail(trail, i * 0.1);
        layoutWakeRibbon(trail, i * 0.1, 0, positions, aux, bounds);
      }
    } finally {
      globalThis.Float32Array = Original;
    }
    expect(constructed).toBe(0);
    expect(positions.length).toBe(WAKE_VERTEX_COUNT * 3);
  });

  it("opens the V over the sample's wake length", () => {
    const trail = createWakeTrail();
    for (let i = 0; i <= 12; i++) pushWakeSample(trail, 0, i, i * 0.2, 4.2, 1);
    const { positions, aux, bounds } = buffers();
    layoutWakeRibbon(trail, 2.4, 0, positions, aux, bounds);
    // Slot 9 is 9 m behind the head (samples 1 m apart, head is z = 12).
    const star = positions[vertex(9, 2, 1) * 3];
    const port = positions[vertex(9, 0, 1) * 3];
    const expected = BOAT_DIMENSIONS.beam * 0.425 + 2.1;
    expect(Math.abs(Math.abs(star) - expected)).toBeLessThan(0.05);
    expect(Math.abs(Math.abs(port) - expected)).toBeLessThan(0.05);
    expect(port).toBeCloseTo(-star, 5);
  });

  it("lays out newest to oldest after the ring has wrapped", () => {
    const trail = createWakeTrail();
    for (let i = 0; i < 60; i++) pushWakeSample(trail, 0, i, i * 0.2, 2, 1);
    expect(trail.count).toBe(WAKE_TRAIL_SAMPLES);
    const { positions, aux, bounds } = buffers();
    expect(layoutWakeRibbon(trail, 11.8, 0, positions, aux, bounds)).toBe(
      WAKE_TRAIL_SAMPLES,
    );
    const zAt = (slot: number) => positions[vertex(slot, 1, 1) * 3 + 2];
    expect(zAt(0)).toBeCloseTo(59, 5);
    expect(zAt(WAKE_TRAIL_SAMPLES - 1)).toBeCloseTo(60 - WAKE_TRAIL_SAMPLES, 5);
    for (let slot = WAKE_TRAIL_SAMPLES - 1; slot > 0; slot--)
      expect(zAt(slot - 1)).toBeGreaterThan(zAt(slot));
  });

  it("index covers every strip once", () => {
    const index = wakeRibbonIndex();
    expect(index.length).toBe(WAKE_STRIPS * (WAKE_TRAIL_SAMPLES - 1) * 2 * 6);
    expect(Math.max(...index)).toBeLessThan(WAKE_VERTEX_COUNT);
    expect(wakeRibbonIndex()).toBe(index);
  });
});
