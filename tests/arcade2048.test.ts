import { describe, it, expect } from "vitest";
import {
  slideArcade,
  newArcadeGame,
  arcadeOver,
  advanceArcade,
} from "../packages/shared/arcade2048";
import { parseClientMessage } from "../packages/shared/protocol";
import {
  Arcade2048Service,
  type ArcadeRecord,
} from "../apps/server/arcade2048";
const board = (...row: number[]) => [...row, ...Array(16 - row.length).fill(0)];
const initial = (owner = "home:2:1"): ArcadeRecord => ({
  version: 1,
  owner,
  name: "Clau",
  game: {
    board: board(2, 2, 2, 2),
    score: 0,
    moves: 0,
    revision: 1,
    continued: false,
  },
  best: 0,
  bestTile: 2,
  bestAt: 1,
  requests: [],
});
describe("2048 rules", () => {
  it("merges each tile once and scores only the resulting tiles", () => {
    const r = slideArcade(board(2, 2, 2, 2), "left");
    expect(r.board.slice(0, 4)).toEqual([4, 4, 0, 0]);
    expect(r.gain).toBe(8);
    expect(slideArcade(board(2, 2, 4, 0), "left").board.slice(0, 4)).toEqual([
      4, 4, 0, 0,
    ]);
  });
  it("handles all four directions and never spawns on an unchanged move", () => {
    expect(slideArcade(board(2, 2, 0, 0), "right").board.slice(0, 4)).toEqual([
      0, 0, 0, 4,
    ]);
    const vertical = board(2, 0, 0, 0, 2);
    expect(slideArcade(vertical, "down").board[12]).toBe(4);
    expect(slideArcade(vertical, "up").board[0]).toBe(4);
    const game = { ...newArcadeGame(() => 0), board: board(2) };
    expect(
      advanceArcade(game, "left", () => {
        throw Error("must not spawn");
      }),
    ).toBe(game);
  });
  it("starts with two tiles and distinguishes a full board with a legal merge", () => {
    expect(newArcadeGame(() => 0).board.filter(Boolean)).toEqual([2, 2]);
    const g = {
      ...newArcadeGame(() => 0),
      board: [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2],
    };
    expect(arcadeOver(g)).toBe(true);
    g.board[1] = 2;
    expect(arcadeOver(g)).toBe(false);
  });
  it("accepts directions only, ignores forged scores, and has no undo operation", () => {
    const message = {
      type: "arcade2048-action",
      requestId: "req-1",
      revision: 1,
      action: {
        kind: "move",
        direction: "left",
        score: 99999,
        board: Array(16).fill(2048),
      },
    };
    expect(parseClientMessage(JSON.stringify(message))).toEqual({
      ...message,
      action: { kind: "move", direction: "left" },
    });
    expect(
      parseClientMessage(
        JSON.stringify({ ...message, action: { kind: "undo" } }),
      ),
    ).toBeNull();
    expect(
      parseClientMessage(
        JSON.stringify({
          ...message,
          action: { kind: "move", direction: "diagonal" },
        }),
      ),
    ).toBeNull();
  });
});
describe("persistent personal games and global rankings", () => {
  it("saves before acknowledging, restores after restart, and keeps boards private", async () => {
    const saved = new Map<string, ArcadeRecord>();
    const store = {
      save: async (o: string, r: ArcadeRecord) => {
        saved.set(o, structuredClone(r));
      },
    };
    const service = new Arcade2048Service(store, [initial()], () => 0);
    const a = await service.act(
      "home:2:1",
      "Clau",
      { kind: "move", direction: "left" },
      1,
      "one",
      10,
    );
    expect(a.game?.score).toBe(8);
    expect(a.leaders).toEqual([{ rank: 1, name: "Clau", score: 8, tile: 4 }]);
    const restored = new Arcade2048Service(store, [...saved.values()], () => 0);
    expect(restored.view("home:2:1")).toEqual(a);
    expect(restored.view("home:2:2").game).toBeNull();
    expect(JSON.stringify(a.leaders)).not.toContain("home:");
    const reset = await restored.act(
      "home:2:1",
      "Clau",
      { kind: "new" },
      2,
      "two",
    );
    expect(reset.game?.score).toBe(0);
    expect(reset.best).toBe(8);
  });
  it("serializes two tabs and deduplicates retries", async () => {
    let writes = 0;
    const service = new Arcade2048Service(
      {
        save: async () => {
          writes++;
        },
      },
      [initial()],
      () => 0,
    );
    const results = await Promise.allSettled([
      service.act(
        "home:2:1",
        "Clau",
        { kind: "move", direction: "left" },
        1,
        "one",
      ),
      service.act(
        "home:2:1",
        "Clau",
        { kind: "move", direction: "right" },
        1,
        "two",
      ),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    await service.act(
      "home:2:1",
      "Clau",
      { kind: "move", direction: "left" },
      1,
      "one",
    );
    expect(writes).toBe(1);
    expect(service.view("home:2:1").game?.score).toBe(8);
  });
  it("rolls back on failed storage and permits a later retry", async () => {
    let fail = true;
    const service = new Arcade2048Service(
      {
        save: async () => {
          if (fail) throw Error("storage");
        },
      },
      [initial()],
      () => 0,
    );
    await expect(
      service.act(
        "home:2:1",
        "Clau",
        { kind: "move", direction: "left" },
        1,
        "one",
      ),
    ).rejects.toThrow("storage");
    expect(service.view("home:2:1").game?.score).toBe(0);
    fail = false;
    expect(
      (
        await service.act(
          "home:2:1",
          "Clau",
          { kind: "move", direction: "left" },
          1,
          "one",
        )
      ).game?.score,
    ).toBe(8);
  });
  it("preserves win continuation and stable global score ordering", async () => {
    const r = initial();
    r.game.board = board(1024, 1024);
    const service = new Arcade2048Service(
      { save: async () => {} },
      [r],
      () => 0,
    );
    await service.act(
      r.owner,
      "Clau",
      { kind: "move", direction: "left" },
      1,
      "win",
    );
    await expect(
      service.act(
        r.owner,
        "Clau",
        { kind: "move", direction: "right" },
        2,
        "blocked",
      ),
    ).rejects.toThrow("Keep going");
    const v = await service.act(
      r.owner,
      "Clau",
      { kind: "continue" },
      2,
      "continue",
    );
    expect(v.game?.continued).toBe(true);
    expect(v.best).toBe(2048);
    await service.act("home:2:2", "Visitor", { kind: "new" }, 0, "new");
    expect(service.view("home:2:2").leaders[0].name).toBe("Clau");
  });
});

it("does not throw when a malformed action kind shadows object coercion methods", () => {
  expect(
    parseClientMessage(
      JSON.stringify({
        type: "arcade2048-action",
        requestId: "bad",
        revision: 0,
        action: { kind: { toString: "not callable" } },
      }),
    ),
  ).toBeNull();
});
