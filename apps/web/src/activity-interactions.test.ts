import { describe, expect, it } from "vitest";
import type { BenchSeat } from "./seating-types";
import {
  activityDurations,
  advanceActivity,
  beginFishing,
  beginLightingFire,
  activitySeatIsValid,
  beginSitting,
  beginSeatMove,
  seatStepForKey,
  cancelActivity,
  idleActivity,
  reelActivity,
  type ActivityInteraction,
} from "./activity-interactions";

const pose = { anchor: [4, 2, 8] as [number, number, number], facing: Math.PI };

describe("fishing interaction lifecycle", () => {
  it("keeps the cast, wait, bite, reel and catch gestures visible and releases control after the catch", () => {
    let state = beginFishing(2, pose, 1000, 0);
    expect(state.kind).toBe("cast");
    expect(advanceActivity(state, 1849).state).toBe(state);
    state = advanceActivity(state, 1850).state;
    expect(state.kind).toBe("fish-wait");
    expect(state.deadline).toBe(3800);
    state = advanceActivity(state, 3800).state;
    expect(state.kind).toBe("bite");
    state = reelActivity(state, 4000)!;
    expect(state.kind).toBe("reel");
    expect(advanceActivity(state, 4949).outcome).toBeUndefined();
    const caught = advanceActivity(state, 4950);
    expect(caught.outcome).toBe("caught");
    expect(caught.state.kind).toBe("catch");
    expect(caught.state.station).toBe(2);
    expect(caught.state.pose).toBe(pose);
    expect(advanceActivity(caught.state, 5000).outcome).toBeUndefined();
    expect(advanceActivity(caught.state, 6350).state).toEqual(idleActivity());
  });

  it("preserves the original 2.8–4.6 second bite delay and 2.4 second response window", () => {
    for (const [random, delay] of [
      [0, 2800],
      [1, 4600],
      [-1, 2800],
      [2, 4600],
    ]) {
      const cast = beginFishing(0, pose, 500, random);
      const wait = advanceActivity(cast, 1350).state;
      expect(wait.deadline).toBe(500 + delay);
      const bite = advanceActivity(wait, wait.deadline).state;
      expect(bite.deadline - wait.deadline).toBe(2400);
      expect(reelActivity(bite, bite.deadline - 1)?.kind).toBe("reel");
      expect(reelActivity(bite, bite.deadline)).toBeUndefined();
      const missed = advanceActivity(bite, bite.deadline);
      expect(missed.outcome).toBe("escaped");
      expect(missed.state.kind).toBe("none");
    }
  });

  it("cancellation cannot accidentally save a fish or leave an activity busy", () => {
    for (const kind of [
      "cast",
      "fish-wait",
      "bite",
      "reel",
      "catch",
    ] as const) {
      const cancelled = cancelActivity({ kind, deadline: 2000, pose }, 1500);
      expect(cancelled).toEqual(idleActivity());
      expect(advanceActivity(cancelled, 999999).outcome).toBeUndefined();
    }
  });

  it("does not skip gestures when the browser misses a frame", () => {
    const cast = beginFishing(0, pose, 0, 0);
    const afterStall = advanceActivity(cast, 20000).state;
    expect(afterStall.kind).toBe("fish-wait");
    const bite = advanceActivity(afterStall, 20001).state;
    expect(bite.kind).toBe("bite");
    expect(bite.deadline).toBe(22401);
  });
});

const claimedSeat: BenchSeat = {
  id: "long-bench:1",
  benchId: "long-bench",
  index: 1,
  center: [4, 2.55, 8],
  anchor: [4, 2, 8.33],
  facing: 0,
  seatHeight: 2.55,
  occupantId: "local-player",
};

describe("registered bench activity lifecycle", () => {
  it("uses the registry's seat geometry and identifies the exact claimed slot", () => {
    const state = beginSitting(claimedSeat, 100);
    expect(state.seatId).toBe("long-bench:1");
    expect(state.kind).toBe("sit-down");
    expect(state.deadline).toBe(800);
    expect(state.pose).toEqual({
      anchor: claimedSeat.anchor,
      facing: 0,
      seatHeight: 2.55,
    });
  });

  it("holds the claim through entering, sitting and standing, then drops it when control returns", () => {
    const sitting = beginSitting(claimedSeat, 0);
    const seated = advanceActivity(sitting, 700).state;
    expect(seated.kind).toBe("sit");
    expect(seated.seatId).toBe(claimedSeat.id);
    expect(advanceActivity(seated, 100000).state).toBe(seated);
    const standing = cancelActivity(seated, 1000);
    expect(standing.kind).toBe("stand-up");
    expect(standing.pose).toBe(sitting.pose);
    expect(standing.seatId).toBe(claimedSeat.id);
    expect(cancelActivity(standing, 1100)).toBe(standing);
    expect(
      advanceActivity(standing, 1000 + activityDurations["stand-up"] - 1).state
        .seatId,
    ).toBe(claimedSeat.id);
    const done = advanceActivity(standing, 1650).state;
    expect(done.kind).toBe("none");
    expect(done.seatId).toBeUndefined();
  });

  it("can interrupt sitting down while retaining the seat until the stand gesture finishes", () => {
    const sitting = beginSitting(claimedSeat, 0);
    const standing = cancelActivity(sitting, 100);
    expect(standing.kind).toBe("stand-up");
    expect(standing.seatId).toBe(claimedSeat.id);
    expect(advanceActivity(standing, 750).state).toEqual(idleActivity());
  });

  it("detects seat removal, lost ownership or a different slot without invalidating non-seated activities", () => {
    const sitting = beginSitting(claimedSeat, 0);
    expect(activitySeatIsValid(sitting, claimedSeat, "local-player")).toBe(
      true,
    );
    expect(activitySeatIsValid(sitting, undefined, "local-player")).toBe(false);
    expect(
      activitySeatIsValid(
        sitting,
        { ...claimedSeat, occupantId: null },
        "local-player",
      ),
    ).toBe(false);
    expect(
      activitySeatIsValid(
        sitting,
        { ...claimedSeat, occupantId: "other-actor" },
        "local-player",
      ),
    ).toBe(false);
    expect(
      activitySeatIsValid(
        sitting,
        { ...claimedSeat, id: "another-slot" },
        "local-player",
      ),
    ).toBe(false);
    expect(
      activitySeatIsValid(
        beginFishing(0, pose, 0, 0),
        undefined,
        "local-player",
      ),
    ).toBe(true);
    expect(activitySeatIsValid(idleActivity(), undefined, "local-player")).toBe(
      true,
    );
  });
});

describe("seated adjacent movement", () => {
  const next: BenchSeat = {
    ...claimedSeat,
    id: "long-bench:2",
    index: 2,
    anchor: [4.65, 2, 8.33],
    center: [4.65, 2.55, 8],
  };
  it("keeps a seated gesture throughout movement and completes at the claimed destination", () => {
    const moving = beginSeatMove(claimedSeat, next, 1000);
    expect(moving.kind).toBe("scoot-left");
    expect(moving.seatId).toBe(next.id);
    expect(moving.pose?.fromAnchor).toBe(claimedSeat.anchor);
    expect(moving.pose?.anchor).toBe(next.anchor);
    expect(advanceActivity(moving, 1599).state).toBe(moving);
    const done = advanceActivity(moving, 1600);
    expect(done.outcome).toBe("seat-moved");
    expect(done.state.kind).toBe("sit");
    expect(done.state.seatId).toBe(next.id);
    expect(done.state.pose?.fromAnchor).toBeUndefined();
    expect(done.state.pose?.anchor).toBe(next.anchor);
  });
  it("finishes the move before a queued stand and then releases normally", () => {
    const moving = beginSeatMove(claimedSeat, next, 1000),
      cancelled = cancelActivity(moving, 1200);
    expect(cancelled.kind).toBe(moving.kind);
    expect(cancelled.deadline).toBe(1600);
    expect(cancelled.pose).toBe(moving.pose);
    const standing = advanceActivity(cancelled, 1600);
    expect(standing.state.kind).toBe("stand-up");
    expect(standing.outcome).toBe("seat-moved");
    expect(standing.state.seatId).toBe(next.id);
    expect(advanceActivity(standing.state, 2250).state.kind).toBe("none");
  });
  it("never creates a move across benches or over another seat", () => {
    expect(() =>
      beginSeatMove(claimedSeat, { ...next, benchId: "other" }, 0),
    ).toThrow();
    expect(() =>
      beginSeatMove(claimedSeat, { ...next, index: 3 }, 0),
    ).toThrow();
  });
  it("maps A/D to the projected screen side of a rotated bench", () => {
    for (const facing of [0, 0.6, Math.PI, -2]) {
      const along = { x: Math.cos(facing), z: -Math.sin(facing) };
      expect(seatStepForKey("KeyD", facing, along)).toBe(1);
      expect(seatStepForKey("KeyA", facing, along)).toBe(-1);
      expect(seatStepForKey("KeyD", facing, { x: -along.x, z: -along.z })).toBe(
        -1,
      );
    }
  });
});

describe("lighting a campfire", () => {
  it("approaches the near log edge before kneeling, and returns control after the full gesture", () => {
    const approach = beginLightingFire([0, 2, 5], [0, 2, 0], 1000);
    expect(approach.kind).toBe("fire-approach");
    expect(approach.pose?.anchor).toEqual([0, 2, 1.65]);
    expect(Math.abs(approach.pose!.facing!)).toBe(Math.PI);
    expect(advanceActivity(approach, approach.deadline - 1).state).toBe(approach);
    const lighting = advanceActivity(approach, approach.deadline).state;
    expect(lighting.kind).toBe("light-fire");
    expect(lighting.pose?.fromAnchor).toBeUndefined();
    expect(lighting.deadline - approach.deadline).toBeCloseTo(3000);
    expect(advanceActivity(lighting, lighting.deadline - 1).state).toBe(lighting);
    expect(advanceActivity(lighting, lighting.deadline).state).toEqual(idleActivity());
  });
  it("cancels approach or kneeling without retaining a seat or movement lock", () => {
    const approach = beginLightingFire([3, 1, 4], [0, 1, 0], 0);
    const lighting = advanceActivity(approach, approach.deadline).state;
    for (const state of [approach, lighting]) {
      expect(state.seatId).toBeUndefined();
      expect(cancelActivity(state, 50)).toEqual(idleActivity());
    }
    const centered = beginLightingFire([0, 1, 0], [0, 1, 0], 0);
    expect(centered.pose?.anchor?.every(Number.isFinite)).toBe(true);
  });
});
