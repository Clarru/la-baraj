import { describe, it, expect } from "vitest";
import {
  Arcade2048Service,
  type ArcadeRecord,
} from "../apps/server/arcade2048";
const DAY = 86_400_000,
  owner = "home:2:1",
  other = "home:2:2";
const legacy = (): ArcadeRecord => ({
  version: 1,
  owner,
  name: "Clau",
  game: {
    board: [2, 2, ...Array(14).fill(0)],
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
function fixture(limit = 2, stored: ArcadeRecord[] = []) {
  const rows = new Map(stored.map((r) => [r.owner, structuredClone(r)]));
  let fail = false,
    writes = 0;
  const store = {
    dailyWriteLimit: limit,
    save: async (o: string, r: ArcadeRecord) => {
      if (fail) throw Error("disk");
      writes++;
      rows.set(o, structuredClone(r));
    },
  };
  return {
    store,
    rows,
    service: new Arcade2048Service(store, stored, () => 0),
    fail: (v: boolean) => {
      fail = v;
    },
    writes: () => writes,
  };
}
describe("arcade-only persisted daily logical write protection", () => {
  it("shares a tiny budget across owners and preserves board, best and request IDs on rejection", async () => {
    const f = fixture(2, [legacy()]);
    await f.service.act(
      owner,
      "Clau",
      { kind: "move", direction: "left" },
      1,
      "move",
      DAY,
    );
    await f.service.act(other, "Guest", { kind: "new" }, 0, "new", DAY);
    const before = f.service.view(owner),
      row = structuredClone(f.rows.get(owner));
    await expect(
      f.service.act(owner, "Clau", { kind: "new" }, 2, "blocked", DAY),
    ).rejects.toThrow("Saving is paused");
    expect(f.service.view(owner)).toEqual(before);
    expect(f.rows.get(owner)).toEqual(row);
    expect(f.writes()).toBe(2);
    expect(row?.writeBudget).toEqual({ day: 1, count: 1 });
    expect(f.rows.get(other)?.writeBudget).toEqual({ day: 1, count: 1 });
    expect(JSON.stringify(f.service.view(owner))).not.toContain("writeBudget");
  });
  it("loads the consumed budget after restart and resets only for a new UTC day", async () => {
    const f = fixture(1);
    await f.service.act(owner, "Clau", { kind: "new" }, 0, "one", DAY + 1);
    const awake = new Arcade2048Service(f.store, [...f.rows.values()], () => 0);
    await expect(
      awake.act(other, "Guest", { kind: "new" }, 0, "blocked", 2 * DAY - 1),
    ).rejects.toThrow("Saving is paused");
    await awake.act(other, "Guest", { kind: "new" }, 0, "tomorrow", 2 * DAY);
    expect(f.rows.get(other)?.writeBudget).toEqual({ day: 2, count: 1 });
    await expect(
      awake.act(
        owner,
        "Clau",
        { kind: "new" },
        1,
        "blocked-again",
        2 * DAY + 1,
      ),
    ).rejects.toThrow("Saving is paused");
  });
  it("does not charge failures, unchanged moves, reads, unchanged resume or duplicate requests", async () => {
    const f = fixture(1, [legacy()]);
    f.fail(true);
    await expect(
      f.service.act(
        owner,
        "Clau",
        { kind: "move", direction: "left" },
        1,
        "retry",
        DAY,
      ),
    ).rejects.toThrow("disk");
    expect(f.rows.get(owner)?.writeBudget).toBeUndefined();
    expect(f.service.view(owner).game?.revision).toBe(1);
    f.fail(false);
    await f.service.act(owner, "Clau", { kind: "leaders" }, 1, "read", DAY);
    await f.service.act(owner, "Clau", { kind: "resume" }, 1, "resume", DAY);
    await f.service.act(
      owner,
      "Clau",
      { kind: "move", direction: "up" },
      1,
      "noop",
      DAY,
    );
    expect(f.writes()).toBe(0);
    await f.service.act(
      owner,
      "Clau",
      { kind: "move", direction: "left" },
      1,
      "retry",
      DAY,
    );
    expect(f.writes()).toBe(1);
    await f.service.act(
      owner,
      "Clau",
      { kind: "move", direction: "left" },
      1,
      "retry",
      DAY,
    );
    await f.service.act(owner, "Clau", { kind: "leaders" }, 2, "read2", DAY);
    await f.service.act(owner, "Clau", { kind: "resume" }, 2, "resume2", DAY);
    expect(f.writes()).toBe(1);
  });
  it("charges successful rename and continuation, while accepting legacy records without metadata", async () => {
    const r = legacy();
    r.game.board = [2048, ...Array(15).fill(0)];
    r.game.score = 2048;
    r.best = 2048;
    r.bestTile = 2048;
    const f = fixture(2, [r]);
    await f.service.act(owner, "Renamed", { kind: "resume" }, 1, "rename", DAY);
    expect(f.rows.get(owner)?.writeBudget?.count).toBe(1);
    await f.service.act(
      owner,
      "Renamed",
      { kind: "continue" },
      1,
      "continue",
      DAY,
    );
    expect(f.rows.get(owner)?.writeBudget?.count).toBe(2);
    expect(f.service.view(owner).game?.continued).toBe(true);
    await f.service.act(
      owner,
      "Renamed",
      { kind: "continue" },
      2,
      "noop-continue",
      DAY,
    );
    expect(f.writes()).toBe(2);
    await expect(
      f.service.act(
        owner,
        "Another",
        { kind: "resume" },
        2,
        "rename-blocked",
        DAY,
      ),
    ).rejects.toThrow("Saving is paused");
    expect(f.rows.get(owner)?.name).toBe("Renamed");
  });
  it("allows local unranked practice to bypass the durable write budget", async () => {
    let writes = 0;
    const service = new Arcade2048Service(
      {
        ranked: false,
        dailyWriteLimit: 0,
        save: async () => {
          writes++;
        },
      },
      [],
      () => 0,
    );
    await service.act(owner, "Practice", { kind: "new" }, 0, "one", DAY);
    await service.act(owner, "Practice", { kind: "new" }, 1, "two", DAY);
    expect(writes).toBe(2);
    expect(service.view(owner).ranked).toBe(false);
  });
  it.each([null, [], { day: 1.5, count: 1 }, { day: 1, count: -1 }])(
    "rejects malformed persisted meters without discarding saved progress: %j",
    (writeBudget) => {
      expect(
        () =>
          new Arcade2048Service({ save: async () => {} }, [
            { ...legacy(), writeBudget },
          ]),
      ).toThrow("Invalid stored");
    },
  );
  it("serializes simultaneous owners so the last available save cannot be overspent", async () => {
    const f = fixture(1);
    const results = await Promise.allSettled([
      f.service.act(owner, "Clau", { kind: "new" }, 0, "one", DAY),
      f.service.act(other, "Guest", { kind: "new" }, 0, "two", DAY),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    expect(f.writes()).toBe(1);
    expect(f.rows.size).toBe(1);
  });
});
