import { describe, expect, it } from "vitest";
import { newPresentedShot } from "./PlanesShot";
import { type PlanesView, type Side } from "../../../packages/shared/planes";
function state(you: Side | null = 0): PlanesView {
  return {
    version: 1,
    revision: 1,
    round: 4,
    phase: "playing",
    you,
    players: [null, null],
    ownPlanes: [],
    shots: [[], []],
    turn: 1,
    winner: null,
    deadline: null,
    reason: null,
    event: null,
  };
}
function next(previous: PlanesView, side: Side = 1): PlanesView {
  const view = structuredClone(previous);
  view.revision++;
  view.shots[side].push({ x: 3, y: 3, result: "body" });
  view.event = {
    id: 2,
    at: Date.now(),
    actor: "socket-a",
    target: "socket-b",
    result: "body",
    winner: null,
  };
  view.turn = side === 0 ? 1 : 0;
  return view;
}
describe("new shot presentation boundaries", () => {
  it.each([0, 1] as const)("locates an incoming shot for side %i", (you) => {
    const before = state(you);
    before.turn = you === 0 ? 1 : 0;
    const after = next(before, before.turn!);
    expect(newPresentedShot(before, after)).toMatchObject({
      incoming: true,
      you,
      shot: { x: 3, y: 3, result: "body" },
    });
    expect(newPresentedShot(after, after)).toBeNull();
  });
  it("locates your outgoing shot without exposing another fleet", () => {
    const before = state();
    before.turn = 0;
    expect(newPresentedShot(before, next(before, 0))).toMatchObject({
      incoming: false,
    });
  });
  it("does not replay joined, spectator, changed-seat, or new-round histories", () => {
    const before = state(),
      after = next(before);
    expect(newPresentedShot(null, after)).toBeNull();
    for (const change of [
      { you: null },
      { you: 1 as const },
      { round: 5 },
      { phase: "setup" as const },
    ])
      expect(newPresentedShot(before, { ...after, ...change })).toBeNull();
  });
  it("skips a catch-up snapshot with multiple missed shots", () => {
    const before = state(),
      after = next(before);
    after.shots[0].push({ x: 1, y: 1, result: "miss" });
    expect(newPresentedShot(before, after)).toBeNull();
    after.shots[0] = [];
    after.shots[1].push({ x: 2, y: 1, result: "miss" });
    expect(newPresentedShot(before, after)).toBeNull();
  });
  it("keeps the winning cockpit shot, but never animates a forfeit", () => {
    const before = state(),
      after = next(before);
    after.phase = "finished";
    after.reason = "fleet";
    after.shots[1][0].result = "head";
    after.event!.result = "head";
    expect(newPresentedShot(before, after)?.shot.result).toBe("head");
    after.reason = "left";
    expect(newPresentedShot(before, after)).toBeNull();
  });
  it("ignores unrelated revisions and inconsistent event results", () => {
    const before = state(),
      after = next(before);
    after.event!.result = "miss";
    expect(newPresentedShot(before, after)).toBeNull();
    after.event = null;
    expect(newPresentedShot(before, after)).toBeNull();
  });
});
