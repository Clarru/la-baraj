import { describe, expect, it } from "vitest";
import { newPresentedShots } from "./PlanesShot";
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
    id: view.revision,
    at: Date.now(),
    actor: "socket-a",
    target: "socket-b",
    result: "body",
    winner: null,
  };
  view.turn = side === 0 ? 1 : 0;
  return view;
}
describe("accepted shot presentation order", () => {
  it.each([0, 1] as const)("locates incoming shots for side %i", (you) => {
    const before = state(you);
    before.turn = you === 0 ? 1 : 0;
    const after = next(before, before.turn!);
    expect(newPresentedShots(before, after)).toMatchObject([
      { incoming: true, you, shot: { x: 3, y: 3, result: "body" } },
    ]);
    expect(newPresentedShots(after, after)).toEqual([]);
  });
  it("locates outgoing shots", () => {
    const before = state();
    before.turn = 0;
    expect(newPresentedShots(before, next(before, 0))).toMatchObject([
      { incoming: false },
    ]);
  });
  it("does not replay joined, spectator, changed-seat, or new-round histories", () => {
    const before = state(),
      after = next(before);
    expect(newPresentedShots(null, after)).toEqual([]);
    for (const change of [
      { you: null },
      { you: 1 as const },
      { round: 5 },
      { phase: "setup" as const },
    ])
      expect(newPresentedShots(before, { ...after, ...change })).toEqual([]);
  });
  it("recovers every shot in alternating order when several updates are coalesced", () => {
    const before = state(),
      after = next(next(next(before, 1), 0), 1);
    expect(
      newPresentedShots(before, after).map((p) => [p.side, p.index, p.id]),
    ).toEqual([
      [1, 0, "1:0"],
      [0, 0, "0:0"],
      [1, 1, "1:1"],
    ]);
  });
  it("rejects an invalid extension or truncated history", () => {
    const before = state(),
      after = next(next(before, 1), 1);
    expect(newPresentedShots(before, after)).toEqual([]);
    expect(newPresentedShots(after, before)).toEqual([]);
  });
  it("keeps the winning cockpit shot but never animates a forfeit", () => {
    const before = state(),
      after = next(before);
    after.phase = "finished";
    after.reason = "fleet";
    after.shots[1][0].result = "head";
    after.event!.result = "head";
    expect(newPresentedShots(before, after)[0]?.shot.result).toBe("head");
    after.reason = "left";
    expect(newPresentedShots(before, after)).toEqual([]);
  });
  it("ignores unrelated revisions and inconsistent event results", () => {
    const before = state(),
      after = next(before);
    after.event!.result = "miss";
    expect(newPresentedShots(before, after)).toEqual([]);
    after.event = null;
    expect(newPresentedShots(before, after)).toEqual([]);
  });
});
