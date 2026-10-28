import { describe, it, expect } from "vitest";
import {
  planeCells,
  legalFleet,
  randomFleet,
  resolveShot,
  targetUnavailable,
  type Plane,
  type Side,
  type PlanesAction,
} from "../packages/shared/planes";
import {
  PLANES_SEATS,
  PLANES_TABLE,
  planesSeatPose,
} from "../packages/shared/planes-station";
import {
  PlanesTable,
  readPlanesRecord,
  nextPlanesDeadline,
  type PlanesRecord,
  type TableActor,
} from "../apps/server/planes-table";
import { nextWorldDeadline } from "../apps/server/world-alarm";
import {
  RoomCore,
  type RoomConnection,
  type SessionState,
} from "../apps/server/room-core";
import { HomeAssignments } from "../apps/server/home-assignments";
import {
  parseClientMessage,
  HOUSING_EPOCH,
  HOME_NAME_GRACE_MS,
  type ServerMessage,
} from "../packages/shared/protocol";

const a: TableActor = { owner: "home:2:0", socket: "alice", name: "Alice" };
const b: TableActor = { owner: "home:2:1", socket: "bob", name: "Bob" };
const fleet = (): Plane[] => randomFleet(() => 0.371);
function tableFixture() {
  const saved: PlanesRecord[] = [];
  const table = new PlanesTable({
    save: async (r) => {
      saved.push(structuredClone(r));
    },
    random: () => 0.371,
  });
  const act = (
    who: TableActor,
    action: PlanesAction,
    id = `action-${table.view(who).revision}`,
    now = 1000,
  ) => table.act(who, action, id, table.view(who).revision, now);
  const start = async () => {
    await table.join(a, 0, 0);
    await table.join(b, 1, 0);
    await act(a, { kind: "ready", planes: fleet() });
    await act(b, { kind: "ready", planes: fleet() });
  };
  return { table, saved, act, start };
}
describe("squared-paper planes rules", () => {
  it("keeps a ten-square footprint through all four rotations", () => {
    for (let rotation = 0; rotation < 4; rotation++) {
      const cells = planeCells({ x: 5, y: 5, rotation });
      expect(cells).toHaveLength(10);
      expect(new Set(cells.map((p) => `${p.x},${p.y}`)).size).toBe(10);
    }
  });
  it("deals legal non-overlapping fleets across deterministic seeds", () => {
    for (let seed = 0; seed < 100; seed++) {
      let state = seed + 1;
      const random = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
      };
      expect(legalFleet(randomFleet(random))).toBe(true);
    }
  });
  it("rejects overlap, missing planes, out-of-bounds, fractional and unbounded rotations", () => {
    const f = fleet();
    for (const value of [
      f.slice(0, 2),
      [f[0], f[0], f[1]],
      [{ ...f[0], x: -1 }, ...f.slice(1)],
      [{ ...f[0], x: 0.5 }, ...f.slice(1)],
      [{ ...f[0], rotation: Infinity }, ...f.slice(1)],
    ])
      expect(legalFleet(value)).toBe(false);
  });
  it("reports bodies separately from heads, reveals only a destroyed plane and prevents repeated targets", () => {
    const f = fleet(),
      p = f[0],
      body = planeCells(p)[1];
    expect(resolveShot(f, [], body.x, body.y).result).toBe("body");
    const shot = resolveShot(f, [], p.x, p.y);
    expect(shot).toStrictEqual({ x: p.x, y: p.y, result: "head", revealed: p });
  });
  it("blocks all squares of a revealed aircraft but leaves untouched squares selectable", () => {
    const f = fleet(),
      p = f[0],
      shot = resolveShot(f, [], p.x, p.y);
    expect(
      planeCells(p).every((c) => targetUnavailable(c.x, c.y, [shot])),
    ).toBe(true);
    expect(() => resolveShot(f, [shot], p.x, p.y)).toThrow();
    const free = Array.from({ length: 100 }, (_, i) => ({
      x: i % 10,
      y: Math.floor(i / 10),
    })).find((c) => !targetUnavailable(c.x, c.y, [shot]))!;
    expect(targetUnavailable(free.x, free.y, [shot])).toBe(false);
  });
  it("bounds and copies the protocol without accepting identity or board overrides", () => {
    const message = {
      type: "planes-action",
      requestId: "test",
      revision: 2,
      action: { kind: "ready", planes: fleet(), owner: "bob" },
    };
    expect(parseClientMessage(JSON.stringify(message))).toEqual({
      ...message,
      action: { kind: "ready", planes: fleet() },
    });
    for (const packet of [
      { ...message, revision: -1 },
      { ...message, action: { kind: "shot", x: 10, y: 0 } },
      { ...message, action: { kind: "ready", planes: [fleet()[0]] } },
    ])
      expect(parseClientMessage(JSON.stringify(packet))).toBeNull();
  });
});
describe("persistent private table", () => {
  it("shares public progress, never opponents' hidden planes or internal owners", async () => {
    const f = tableFixture();
    await f.table.join(a, 0, 0);
    await f.table.join(b, 1, 0);
    expect(f.table.view(a).ownPlanes).toEqual(fleet());
    expect(f.table.view(b).ownPlanes).toEqual(fleet());
    const spectator = f.table.view(null);
    expect(spectator.ownPlanes).toBeNull();
    expect(spectator.you).toBeNull();
    expect(JSON.stringify(spectator)).not.toContain('"owner"');
    expect(JSON.stringify(spectator)).not.toContain('"planes"');
    expect(f.table.view({ ...a, socket: "forged" }).you).toBeNull();
  });
  it("requires both players ready, enforces turns, and resolves a complete win", async () => {
    const f = tableFixture();
    await f.start();
    expect(f.table.view(a).turn).toBe(0);
    await expect(f.act(b, { kind: "shot", x: 0, y: 0 })).rejects.toThrow(
      "turn",
    );
    const planes = fleet();
    for (let i = 0; i < 3; i++) {
      await f.act(a, { kind: "shot", x: planes[i].x, y: planes[i].y });
      if (i < 2)
        await f.act(b, { kind: "shot", x: planes[i].x, y: planes[i].y });
    }
    expect(f.table.view(a)).toMatchObject({
      phase: "finished",
      winner: 0,
      reason: "fleet",
      deadline: null,
    });
    expect(f.table.view(a).players[1]?.remaining).toBe(0);
    expect(readPlanesRecord(f.saved.at(-1))).toEqual(f.saved.at(-1));
  });
  it("deduplicates action retries and rejects stale revisions without consuming a turn", async () => {
    const f = tableFixture();
    await f.start();
    const revision = f.table.view(a).revision,
      p = fleet()[0];
    await f.table.act(
      a,
      { kind: "shot", x: p.x, y: p.y },
      "same",
      revision,
      1100,
    );
    await f.table.act(
      a,
      { kind: "shot", x: p.x, y: p.y },
      "same",
      revision,
      1100,
    );
    expect(f.table.view(a).shots[0]).toHaveLength(1);
    await expect(
      f.table.act(b, { kind: "shot", x: p.x, y: p.y }, "stale", revision, 1200),
    ).rejects.toThrow("changed");
    expect(f.table.view(a).turn).toBe(1);
  });
  it("retains a stable owner's role for reconnect but never lets another player take it", async () => {
    const f = tableFixture();
    await f.start();
    const old = f.table.view(a).ownPlanes;
    await f.table.disconnect(a, 2000);
    expect(f.table.view(b).deadline).toBeNull();
    await expect(
      f.table.join(
        { owner: "other", socket: "intruder", name: "Other" },
        0,
        3000,
      ),
    ).rejects.toThrow();
    const returning = { ...a, socket: "new-socket" };
    expect(await f.table.resume(returning, 3000)).toBe(0);
    expect(f.table.view(returning).ownPlanes).toEqual(old);
    expect(f.table.view(returning).deadline).toBe(63000);
    expect(f.table.view(a).ownPlanes).toBeNull();
  });
  it("expires absent players and inactive turns without pinning a game forever", async () => {
    const f = tableFixture();
    await f.start();
    await f.table.disconnect(a, 2000);
    expect(nextPlanesDeadline(f.saved.at(-1)!)).toBe(32000);
    await f.table.expire(32000);
    expect(f.table.view(b)).toMatchObject({
      phase: "finished",
      winner: 1,
      reason: "connection",
    });
    const g = tableFixture();
    await g.start();
    await g.table.expire(61001);
    expect(g.table.view(b)).toMatchObject({
      phase: "finished",
      winner: 1,
      reason: "timeout",
    });
  });
  it("preserves a complete match through a fresh server instance and detects vanished sockets", async () => {
    const f = tableFixture();
    await f.start();
    const restored = new PlanesTable({ save: async () => {} }, f.saved.at(-1));
    expect(restored.view(a)).toEqual(f.table.view(a));
    await restored.reconcileConnections(new Set([b.socket]), 2000);
    expect(restored.view(b).players[0]).toMatchObject({
      online: false,
      awayUntil: 32000,
    });
  });
  it("doesn't acknowledge a placement whose durable write failed", async () => {
    const f = tableFixture();
    await f.table.join(a, 0, 0);
    await f.table.join(b, 1, 0);
    const original = f.saved.at(-1)!;
    let fail = true;
    const table = new PlanesTable(
      {
        save: async () => {
          if (fail) throw Error("storage");
        },
      },
      original,
    );
    const revision = table.view(a).revision;
    await expect(
      table.act(a, { kind: "ready", planes: fleet() }, "retry", revision, 1000),
    ).rejects.toThrow();
    expect(table.view(a).revision).toBe(revision);
    expect(table.view(a).players[0]?.ready).toBe(false);
    fail = false;
    await table.act(
      a,
      { kind: "ready", planes: fleet() },
      "retry",
      revision,
      1000,
    );
    expect(table.view(a).players[0]?.ready).toBe(true);
  });
  it("accepts simultaneous ready clicks and starts a clean rematch only after both agree", async () => {
    const f = tableFixture();
    await f.table.join(a, 0, 0);
    await f.table.join(b, 1, 0);
    const revision = f.table.view(a).revision;
    await Promise.all([
      f.table.act(
        a,
        { kind: "ready", planes: fleet() },
        "ready-a",
        revision,
        1000,
      ),
      f.table.act(
        b,
        { kind: "ready", planes: fleet() },
        "ready-b",
        revision,
        1000,
      ),
    ]);
    for (let i = 0; i < 3; i++) {
      const p = fleet()[i];
      await f.act(a, { kind: "shot", x: p.x, y: p.y });
      if (i < 2) await f.act(b, { kind: "shot", x: p.x, y: p.y });
    }
    const next = randomFleet(() => 0.713);
    await f.act(a, { kind: "rematch", planes: next });
    expect(f.table.view(a).phase).toBe("finished");
    expect(f.table.view(a).players[1]?.remaining).toBe(0);
    await f.act(b, { kind: "rematch", planes: next });
    expect(f.table.view(a)).toMatchObject({
      phase: "playing",
      round: 2,
      shots: [[], []],
      ownPlanes: next,
    });
    expect(f.table.view(a).players.map((p) => p?.remaining)).toEqual([3, 3]);
  });
  it("holds an observed disconnect in memory when storage fails and retries persistence", async () => {
    const f = tableFixture();
    await f.start();
    let fail = true,
      saved: PlanesRecord | undefined;
    const table = new PlanesTable(
      {
        save: async (r) => {
          if (fail) throw Error("storage");
          saved = structuredClone(r);
        },
      },
      f.saved.at(-1),
    );
    await expect(table.disconnect(a, 2000)).rejects.toThrow("storage");
    expect(table.needsFlush).toBe(true);
    expect(table.view(b).players[0]?.online).toBe(false);
    expect(table.view(a).ownPlanes).toBeNull();
    expect(table.view(b).deadline).toBeNull();
    fail = false;
    await table.flush();
    expect(table.needsFlush).toBe(false);
    expect(saved?.members[0]?.awayUntil).toBe(32000);
    expect(await table.resume({ ...a, socket: "new" }, 3000)).toBe(0);
    expect(table.view({ ...a, socket: "new" }).ownPlanes).toEqual(fleet());
  });
  it("keeps the name-plaque and game deadlines on the same durable alarm", async () => {
    const f = tableFixture();
    await f.start();
    const homes = {
      version: 2 as const,
      owners: [
        {
          digest: "a".repeat(64),
          index: 0,
          ownerName: null,
          pendingName: "Alice",
          nameSince: 1000,
        },
      ],
    };
    expect(nextWorldDeadline(homes, f.saved.at(-1))).toBe(61000);
    const finished = { ...f.saved.at(-1)!, deadline: null };
    expect(nextWorldDeadline(homes, finished)).toBe(1000 + HOME_NAME_GRACE_MS);
  });
});

class Connection implements RoomConnection {
  state: SessionState | null = null;
  closed = false;
  messages: ServerMessage[] = [];
  setState(state: SessionState) {
    this.state = structuredClone(state);
  }
  send(raw: string) {
    this.messages.push(JSON.parse(raw));
  }
  close() {
    this.closed = true;
  }
}
function roomFixture() {
  const connections: Connection[] = [],
    saved: PlanesRecord[] = [];
  const homes = new HomeAssignments({ save: async () => {} });
  const planes = new PlanesTable({
    save: async (record) => {
      saved.push(structuredClone(record));
    },
  });
  const room = new RoomCore({
    connections: () => connections.filter((c) => !c.closed),
    homes,
    planes,
    saveFire: async () => {},
  });
  const connect = (id: string) => {
    const c = new Connection();
    connections.push(c);
    room.connect(c, id, 0);
    return c;
  };
  const send = (c: Connection, m: unknown, now = 1000) =>
    room.message(c, JSON.stringify(m), now);
  const named = async (id: string) => {
    const c = connect(id);
    await send(c, { type: "hello", nickname: id }, 0);
    return c;
  };
  const pose = async (c: Connection, side: Side) => {
    await send(
      c,
      {
        type: "pose",
        pose: {
          ...planesSeatPose(side),
          animation: "Idle_Neutral",
          activity: "none",
          vehicle: "none",
        },
      },
      500,
    );
  };
  return { room, planes, homes, connect, send, named, pose, saved };
}
describe("world/table integration", () => {
  it("atomically admits only one concurrent claimant to each game chair", async () => {
    const f = roomFixture(),
      a = await f.named("Alice"),
      b = await f.named("Bob");
    await f.pose(a, 0);
    await f.pose(b, 0);
    await Promise.all([
      f.send(a, { type: "seat", seatId: PLANES_SEATS[0], requestId: "a" }),
      f.send(b, { type: "seat", seatId: PLANES_SEATS[0], requestId: "b" }),
    ]);
    expect(
      [a, b].filter((c) => c.state!.player.seatId === PLANES_SEATS[0]),
    ).toHaveLength(1);
    expect(f.homes.publicCabins()).toHaveLength(0);
  });
  it("processes an immediate seat cancellation after an in-flight durable join", async () => {
    const f = roomFixture(),
      a = await f.named("Alice");
    await f.pose(a, 0);
    await Promise.all([
      f.send(a, { type: "seat", seatId: PLANES_SEATS[0], requestId: "join" }),
      f.send(a, { type: "seat", seatId: null, requestId: "cancel" }),
    ]);
    expect(a.state!.player.seatId).toBeUndefined();
    expect(f.planes.view(null).players).toEqual([null, null]);
  });
  it("rejects remote seat spoofing and keeps a spectator out of private match state", async () => {
    const f = roomFixture(),
      a = await f.named("Alice"),
      watcher = await f.named("Watcher");
    await f.send(a, {
      type: "seat",
      seatId: PLANES_SEATS[0],
      requestId: "too-far",
    });
    expect(a.state!.player.seatId).toBeUndefined();
    await f.pose(a, 0);
    await f.send(
      a,
      { type: "seat", seatId: PLANES_SEATS[0], requestId: "near" },
      2000,
    );
    const latest = watcher.messages.filter((m) => m.type === "planes").at(-1)!;
    expect(latest.type === "planes" && latest.view.ownPlanes).toBeNull();
  });
  it("resumes a verified cabin owner on a new socket without allocating a new home", async () => {
    const f = roomFixture(),
      a = f.connect("old"),
      token = "a".repeat(43);
    const hello = {
      type: "hello",
      nickname: "Alice",
      housingEpoch: HOUSING_EPOCH,
      requestHome: true,
      resumeToken: token,
      createHome: true,
    };
    await f.send(a, hello, 0);
    await f.pose(a, 0);
    await f.send(
      a,
      { type: "seat", seatId: PLANES_SEATS[0], requestId: "join" },
      1000,
    );
    a.closed = true;
    await f.room.disconnect(a);
    const returning = f.connect("new");
    await f.send(
      returning,
      { ...hello, createHome: undefined },
      Date.now() + 1,
    );
    expect(returning.state!.player.seatId).toBe(PLANES_SEATS[0]);
    expect(f.homes.publicCabins()).toHaveLength(1);
    const snapshot = returning.messages
      .filter((m) => m.type === "snapshot")
      .at(-1)!;
    expect(snapshot.type === "snapshot" && snapshot.planes?.you).toBe(0);
  });
  it("hands a refreshed tab its seat when hello arrives before the old socket closes", async () => {
    const f = roomFixture(),
      old = f.connect("old-fast"),
      token = "b".repeat(43);
    const hello = {
      type: "hello",
      nickname: "Alice",
      housingEpoch: HOUSING_EPOCH,
      requestHome: true,
      resumeToken: token,
      createHome: true,
    };
    await f.send(old, hello, 0);
    await f.pose(old, 0);
    await f.send(
      old,
      { type: "seat", seatId: PLANES_SEATS[0], requestId: "join" },
      1000,
    );
    const returning = f.connect("new-fast");
    await f.send(returning, { ...hello, createHome: undefined }, Date.now());
    expect(returning.state!.resumeTable).toBe(true);
    expect(returning.state!.player.seatId).toBeUndefined();
    old.closed = true;
    await f.room.disconnect(old);
    expect(returning.state!.player.seatId).toBe(PLANES_SEATS[0]);
    expect(returning.state!.resumeTable).toBe(false);
    expect(f.homes.publicCabins()).toHaveLength(1);
    const snapshot = returning.messages
      .filter((m) => m.type === "snapshot")
      .at(-1)!;
    expect(snapshot.type === "snapshot" && snapshot.planes?.you).toBe(0);
  });

  it("recovers after both disconnect storage and alarm scheduling fail, on ordinary traffic", async () => {
    const connections: Connection[] = [],
      homes = new HomeAssignments({ save: async () => {} });
    let fail = false,
      retries = 0;
    const planes = new PlanesTable({
      save: async () => {
        if (fail) throw Error("outage");
      },
    });
    const room = new RoomCore({
      connections: () => connections.filter((c) => !c.closed),
      homes,
      planes,
      saveFire: async () => {},
      retryPlaneCleanup: async () => {
        retries++;
        throw Error("alarm outage");
      },
    });
    const old = new Connection(),
      observer = new Connection();
    connections.push(old, observer);
    room.connect(old, "old");
    room.connect(observer, "observer");
    const send = (c: Connection, m: unknown, now = Date.now()) =>
      room.message(c, JSON.stringify(m), now);
    await send(old, { type: "hello", nickname: "Alice" });
    await send(observer, { type: "hello", nickname: "Observer" });
    await send(old, {
      type: "pose",
      pose: {
        ...planesSeatPose(0),
        animation: "idle",
        activity: "none",
        vehicle: "none",
      },
    });
    await send(old, {
      type: "seat",
      seatId: PLANES_SEATS[0],
      requestId: "join",
    });
    fail = true;
    old.closed = true;
    await room.disconnect(old);
    expect(retries).toBe(1);
    expect(planes.needsFlush).toBe(true);
    fail = false;
    await send(observer, { type: "sync" });
    expect(planes.needsFlush).toBe(false);
    const view = observer.messages.filter((m) => m.type === "planes").at(-1)!;
    expect(view.type === "planes" && view.view.players[0]?.online).toBe(false);
    await room.commitNames(Date.now() + 31000);
    expect(planes.view(null).players).toEqual([null, null]);
  });
  it("broadcasts a deferred recovered role to its opponent during the alarm path", async () => {
    const f = roomFixture(),
      old = f.connect("before"),
      token = "c".repeat(43);
    const hello = {
      type: "hello",
      nickname: "Alice",
      housingEpoch: HOUSING_EPOCH,
      requestHome: true,
      resumeToken: token,
      createHome: true,
    };
    await f.send(old, hello, 0);
    await f.pose(old, 0);
    await f.send(
      old,
      { type: "seat", seatId: PLANES_SEATS[0], requestId: "join" },
      1000,
    );
    const other = await f.named("Bob");
    await f.pose(other, 1);
    await f.send(
      other,
      { type: "seat", seatId: PLANES_SEATS[1], requestId: "other" },
      1000,
    );
    const returning = f.connect("after");
    await f.send(returning, { ...hello, createHome: undefined }, Date.now());
    old.closed = true;
    await f.planes.disconnect({
      owner: "home:2:0",
      socket: "before",
      name: "Alice",
    });
    other.messages = [];
    await f.room.commitNames();
    const update = other.messages.filter((m) => m.type === "planes").at(-1)!;
    expect(update.type === "planes" && update.view.players[0]?.online).toBe(
      true,
    );
    expect(returning.state!.player.seatId).toBe(PLANES_SEATS[0]);
  });
  it("retries an authenticated resume whose own durable write failed", async () => {
    const connections: Connection[] = [],
      homes = new HomeAssignments({ save: async () => {} });
    let fail = false,
      retries = 0;
    const planes = new PlanesTable({
      save: async () => {
        if (fail) throw Error("outage");
      },
    });
    const room = new RoomCore({
      connections: () => connections.filter((c) => !c.closed),
      homes,
      planes,
      saveFire: async () => {},
      retryPlaneCleanup: async () => {
        retries++;
      },
    });
    const old = new Connection();
    connections.push(old);
    room.connect(old, "old-resume");
    const hello = {
      type: "hello",
      nickname: "Alice",
      housingEpoch: HOUSING_EPOCH,
      requestHome: true,
      createHome: true,
      resumeToken: "d".repeat(43),
    };
    await room.message(old, JSON.stringify(hello));
    await room.message(
      old,
      JSON.stringify({
        type: "pose",
        pose: {
          ...planesSeatPose(0),
          animation: "idle",
          activity: "none",
          vehicle: "none",
        },
      }),
    );
    await room.message(
      old,
      JSON.stringify({
        type: "seat",
        seatId: PLANES_SEATS[0],
        requestId: "join",
      }),
    );
    old.closed = true;
    await room.disconnect(old);
    const returning = new Connection();
    connections.push(returning);
    room.connect(returning, "new-resume");
    fail = true;
    await room.message(
      returning,
      JSON.stringify({ ...hello, createHome: undefined }),
    );
    expect(returning.state!.resumeTable).toBe(true);
    expect(returning.state!.player.seatId).toBeUndefined();
    expect(retries).toBe(1);
    fail = false;
    await room.message(
      returning,
      JSON.stringify({ type: "sync" }),
      Date.now() + 1001,
    );
    expect(returning.state!.player.seatId).toBe(PLANES_SEATS[0]);
    expect(returning.state!.resumeTable).toBe(false);
    expect(homes.publicCabins()).toHaveLength(1);
  });
});
