import { describe, expect, it } from "vitest";
import {
  CANONICAL_WORLD_ID,
  HOUSING_EPOCH,
  HOME_NAME_GRACE_MS,
  MAX_HOMES,
  MAX_PLAYERS,
  parseClientMessage,
  type PlayerPose,
  type ServerMessage,
} from "../packages/shared/protocol";
import {
  RoomCore,
  type RoomConnection,
  type SessionState,
} from "../apps/server/room-core";
import {
  allowedOrigin,
  canonicalWorldUrl,
  retireLegacyConnections,
  validRoomPath,
} from "../apps/server/request-policy";
import {
  HomeAssignments,
  readHomeLedger,
  type HomeLedger,
} from "../apps/server/home-assignments";

const pose: PlayerPose = {
  position: [7, 2, 10],
  yaw: 0.5,
  animation: "Walk",
  activity: "none",
  vehicle: "none",
};
const firstFixtureHome = 0;
class FakeConnection implements RoomConnection {
  state: SessionState | null = null;
  messages: ServerMessage[] = [];
  closed: [number, string] | null = null;
  setState(state: SessionState) {
    this.state = structuredClone(state);
  }
  send(message: string) {
    this.messages.push(JSON.parse(message));
  }
  close(code: number, reason: string) {
    this.closed = [code, reason];
  }
}
function fixture() {
  const connections: FakeConnection[] = [];
  const saved: { lit: boolean; revision: number }[] = [];
  const homeSaves: HomeLedger[] = [];
  const homes = new HomeAssignments({
    save: async (ledger) => {
      homeSaves.push(structuredClone(ledger));
    },
  });
  const runtime = {
    connections: () => connections.filter((c) => !c.closed),
    saveFire: async (fire: { lit: boolean; revision: number }) => {
      saved.push(fire);
    },
    homes,
  };
  const room = new RoomCore(runtime);
  const connect = (id: string) => {
    const c = new FakeConnection();
    connections.push(c);
    room.connect(c, id, 0);
    return c;
  };
  const send = (connection: FakeConnection, message: unknown, now = 0) =>
    room.message(connection, JSON.stringify(message), now);
  return { room, connect, send, connections, saved, runtime, homeSaves };
}
const token = (index: number) => index.toString(16).padStart(43, "a");
const homeHello = (index: number, createHome = true) => ({
  type: "hello",
  nickname: "Same nickname",
  housingEpoch: HOUSING_EPOCH,
  requestHome: true,
  resumeToken: token(index),
  ...(createHome ? { createHome: true } : {}),
});

describe("bounded friend-room protocol", () => {
  it("copies allowed fields and ignores forged identity", () => {
    expect(
      parseClientMessage(
        JSON.stringify({
          type: "pose",
          id: "victim",
          pose: { ...pose, id: "victim" },
        }),
      ),
    ).toEqual({ type: "pose", pose });
    expect(
      parseClientMessage(
        JSON.stringify({ type: "hello", nickname: "  Claudiu  " }),
      ),
    ).toEqual({ type: "hello", nickname: "Claudiu" });
  });
  it("rejects malformed, oversized, nonfinite and out-of-bounds data", () => {
    for (const raw of [
      "{",
      "null",
      "[]",
      "x".repeat(1025),
      JSON.stringify({
        type: "pose",
        pose: { ...pose, position: [1, 2, null] },
      }),
      JSON.stringify({
        type: "pose",
        pose: { ...pose, position: [5001, 0, 0] },
      }),
      JSON.stringify({ type: "hello", nickname: "<script>" }),
      JSON.stringify({ type: "seat", seatId: "__proto__", requestId: "a" }),
    ])
      expect(parseClientMessage(raw)).toBeNull();
  });
  it("restricts paths and exact origins, including missing origins", () => {
    expect(validRoomPath("/parties/world-room/qwertyuiopasdfghjklzxcv")).toBe(
      true,
    );
    for (const path of [
      "/parties/world-room/public",
      "/parties/other/qwertyuiopasdfghjklzxcv",
      "/parties/world-room/qwertyuiopasdfghjklzxcv/extra",
      "/parties/world-room/%2Fqwertyuiopasdfghjklzxcv",
    ])
      expect(validRoomPath(path)).toBe(false);
    expect(
      allowedOrigin(
        "https://friends.example",
        "https://friends.example,http://localhost:5173",
      ),
    ).toBe(true);
    for (const origin of [
      null,
      "https://friends.example.attacker.test",
      "https://friends.example/",
      "null",
    ])
      expect(allowedOrigin(origin, "https://friends.example")).toBe(false);
  });
  it("requires an explicit bounded home capability and ignores ownership overrides", () => {
    expect(
      parseClientMessage(JSON.stringify({ ...homeHello(1), homeIndex: 25 })),
    ).toEqual(homeHello(1));
    for (const message of [
      { ...homeHello(1), resumeToken: "short" },
      { type: "hello", nickname: "A", requestHome: true },
      { type: "hello", nickname: "A", createHome: true },
      { ...homeHello(1), requestHome: false },
    ])
      expect(parseClientMessage(JSON.stringify(message))).toBeNull();
  });
  it("routes the canonical address and every accepted legacy link to one preserved world", () => {
    expect(CANONICAL_WORLD_ID).toBe("27f6361b353f4b5db885fd37fac89eda");
    for (const id of [
      CANONICAL_WORLD_ID,
      "qwertyuiopasdfghjklzxcv",
      "a".repeat(80),
    ]) {
      const original = new URL(
        `https://world.example/parties/world-room/${id}?_pk=client-id`,
      );
      const routed = canonicalWorldUrl(original)!;
      expect(routed.pathname).toBe(`/parties/world-room/${CANONICAL_WORLD_ID}`);
      expect(routed.search).toBe("?_pk=client-id");
      expect(original.pathname).toBe(`/parties/world-room/${id}`);
    }
    for (const path of [
      "/parties/world-room/public",
      "/parties/other/qwertyuiopasdfghjklzxcv",
      "/parties/world-room/qwertyuiopasdfghjklzxcv/extra",
    ])
      expect(
        canonicalWorldUrl(new URL(path, "https://world.example")),
      ).toBeNull();
  });
  it("retires only archived worlds and leaves canonical connections untouched", () => {
    const a = new FakeConnection(),
      b = new FakeConnection();
    expect(retireLegacyConnections(CANONICAL_WORLD_ID, [a, b])).toBe(false);
    expect(a.closed).toBeNull();
    expect(b.closed).toBeNull();
    expect(retireLegacyConnections("qwertyuiopasdfghjklzxcv", [a, b])).toBe(
      true,
    );
    expect(a.closed?.[0]).toBe(1012);
    expect(b.closed?.[0]).toBe(1012);
    expect(retireLegacyConnections("qwertyuiopasdfghjklzxcv", [])).toBe(true);
  });
});

describe("persistent cabin ownership", () => {
  it("keeps legacy hello clients online without consuming cabins", async () => {
    const f = fixture(),
      a = f.connect("legacy");
    await f.send(a, { type: "hello", nickname: "Legacy", homeIndex: 18 });
    expect(a.state!.player.nickname).toBe("Legacy");
    expect(a.state!.home).toBeUndefined();
    expect(f.homeSaves).toHaveLength(0);
    expect(a.closed).toBeNull();
    await f.send(a, homeHello(1), 1000);
    expect(a.state!.player.homeIndex).toBe(firstFixtureHome);
    expect(f.homeSaves).toHaveLength(1);
  });
  it("assigns the next sequential homes concurrently and never publishes credentials", async () => {
    const f = fixture(),
      a = f.connect("public-a"),
      b = f.connect("public-b");
    await Promise.all([f.send(a, homeHello(1)), f.send(b, homeHello(2))]);
    expect(a.state!.home!.index).toBe(firstFixtureHome);
    expect(b.state!.home!.index).not.toBe(firstFixtureHome);
    expect(a.state!.home!.index).not.toBe(b.state!.home!.index);
    const aSnapshot = a.messages.findLast(
      (message) => message.type === "snapshot",
    );
    expect(aSnapshot).toMatchObject({
      home: { index: firstFixtureHome, resumeToken: token(1) },
    });
    expect(JSON.stringify(a.messages)).not.toContain(token(2));
    expect(JSON.stringify(b.messages)).not.toContain(token(1));
    expect(JSON.stringify(f.homeSaves)).not.toContain(token(1));
    expect(JSON.stringify(f.homeSaves)).not.toContain(token(2));
    for (const message of [...a.messages, ...b.messages])
      if (message.type !== "snapshot")
        expect(JSON.stringify(message)).not.toContain("resumeToken");
  });
  it("deduplicates simultaneous first hellos and retries after a lost acknowledgement", async () => {
    const f = fixture(),
      a = f.connect("a");
    await Promise.all([f.send(a, homeHello(1)), f.send(a, homeHello(1))]);
    expect(f.homeSaves).toHaveLength(1);
    a.close(1000, "lost ack");
    const b = f.connect("new-public-id");
    await f.send(b, homeHello(1));
    expect(b.state!.home!.index).toBe(a.state!.home!.index);
    expect(b.state!.player.id).not.toBe(a.state!.player.id);
    expect(f.homeSaves).toHaveLength(1);
  });
  it("resumes an allocation when the first socket disconnects during its storage write", async () => {
    const f = fixture(),
      a = f.connect("departing");
    let finishWrite!: () => void,
      startWrite!: () => void,
      writes = 0;
    const writing = new Promise<void>((resolve) => {
      startWrite = resolve;
    });
    const homes = new HomeAssignments({
      save: async () => {
        writes++;
        startWrite();
        await new Promise<void>((resolve) => {
          finishWrite = resolve;
        });
      },
    });
    const room = new RoomCore({ ...f.runtime, homes });
    const first = room.message(a, JSON.stringify(homeHello(1)), 0);
    await writing;
    a.close(1000, "connection dropped");
    const messagesBefore = a.messages.length;
    finishWrite();
    await first;
    expect(a.messages).toHaveLength(messagesBefore);
    const b = f.connect("retry");
    await room.message(b, JSON.stringify(homeHello(1)), 1000);
    expect(b.state!.home).toBeDefined();
    expect(writes).toBe(1);
  });
  it("preserves a newer nickname, pose, and seat while an earlier home hello awaits storage", async () => {
    const f = fixture(),
      a = f.connect("a"),
      observer = f.connect("observer");
    let finishWrite!: () => void, startWrite!: () => void;
    const writing = new Promise<void>((resolve) => {
      startWrite = resolve;
    });
    const homes = new HomeAssignments({
      save: async () => {
        if (!finishWrite) {
          startWrite();
          await new Promise<void>((resolve) => {
            finishWrite = resolve;
          });
        }
      },
    });
    const room = new RoomCore({ ...f.runtime, homes });
    const first = room.message(
      a,
      JSON.stringify({ ...homeHello(1), nickname: "Earlier" }),
      0,
    );
    await writing;
    expect(a.state!.player.nickname).toBe("Earlier");
    await room.message(
      a,
      JSON.stringify({ type: "hello", nickname: "Newest" }),
      100,
    );
    await room.message(a, JSON.stringify({ type: "pose", pose }), 100);
    await room.message(
      a,
      JSON.stringify({
        type: "seat",
        seatId: "bench:seat:0",
        requestId: "seat",
      }),
      100,
    );
    finishWrite();
    await first;
    expect(a.state!.player).toMatchObject({
      ...pose,
      nickname: "Newest",
      seatId: "bench:seat:0",
      homeIndex: a.state!.home!.index,
    });
    expect(observer.messages.at(-1)).toMatchObject({
      type: "pose",
      player: {
        ...pose,
        nickname: "Newest",
        seatId: "bench:seat:0",
        homeIndex: a.state!.home!.index,
      },
    });
    expect(a.messages.at(-1)).toMatchObject({
      type: "snapshot",
      players: expect.arrayContaining([
        expect.objectContaining({ id: "a", nickname: "Newest" }),
      ]),
    });
  });
  it("restores ownership after storage reload and hibernation, including older attachments", async () => {
    const f = fixture(),
      a = f.connect("a");
    await f.send(a, homeHello(1));
    const homes = new HomeAssignments(
      {
        save: async () => {
          throw Error("Unexpected extra allocation");
        },
      },
      f.homeSaves.at(-1),
    );
    const recovered = new RoomCore({ ...f.runtime, homes });
    await recovered.message(a, JSON.stringify({ type: "sync" }), 1000);
    expect(a.messages.at(-1)).toMatchObject({
      type: "snapshot",
      home: a.state!.home,
    });
    a.close(1000, "left");
    const b = f.connect("b");
    await recovered.message(b, JSON.stringify(homeHello(1, false)), 1000);
    expect(b.state!.home!.index).toBe(a.state!.home!.index);
    expect(b.messages.at(-1)).toMatchObject({
      type: "snapshot",
      home: a.state!.home,
    });
  });
  it("retains fifty offline homes, rejects a new owner, and resumes existing owners", async () => {
    let stored: HomeLedger | undefined;
    const homes = new HomeAssignments({
      save: async (ledger) => {
        stored = structuredClone(ledger);
      },
    });
    expect(MAX_HOMES).toBe(50);
    const results = await Promise.all(
      Array.from({ length: MAX_HOMES }, (_, i) => homes.claim(token(i), true)),
    );
    expect(new Set(results.map((home) => home.index)).size).toBe(50);
    expect(stored!.owners).toHaveLength(50);
    const recovered = new HomeAssignments(
      {
        save: async () => {
          throw Error("No new writes expected");
        },
      },
      stored,
    );
    await expect(recovered.claim(token(50), true)).rejects.toMatchObject({
      code: "homes-full",
    });
    await expect(recovered.claim(token(5), false)).resolves.toEqual(results[5]);
    await expect(recovered.claim(token(5), true)).resolves.toEqual(results[5]);
  });
  it("keeps the first thirty owners stable as the village grows", async () => {
    let stored: HomeLedger | undefined;
    const original = new HomeAssignments({
      save: async (ledger) => {
        stored = structuredClone(ledger);
      },
    });
    const firstOwners = await Promise.all(
      Array.from({ length: 30 }, (_, i) => original.claim(token(i), true)),
    );
    expect(firstOwners.map((home) => home.index)).toEqual(
      Array.from({ length: 30 }, (_, index) => index),
    );
    const originalLedger = structuredClone(stored!);
    const expanded = new HomeAssignments(
      {
        save: async (ledger) => {
          stored = structuredClone(ledger);
        },
      },
      originalLedger,
    );
    expect(await expanded.claim(token(0))).toEqual(firstOwners[0]);
    const added = await expanded.claim(token(30), true);
    expect(added.index).toBe(30);
    expect(stored!.version).toBe(2);
    expect(stored!.owners.slice(0, 30)).toEqual(originalLedger.owners);
    expect(await expanded.claim(token(29))).toEqual(firstOwners[29]);
  });
  it("rejects unknown resume and attempts to override or switch ownership", async () => {
    const f = fixture(),
      a = f.connect("a"),
      b = f.connect("b");
    await f.send(a, { ...homeHello(1), homeIndex: 49 });
    const assigned = a.state!.home!.index;
    await f.send(a, {
      type: "pose",
      homeIndex: 0,
      pose: { ...pose, homeIndex: 0 },
    });
    expect(a.state!.player.homeIndex).toBe(assigned);
    await f.send(b, homeHello(2, false));
    expect(b.closed?.[0]).toBe(1008);
    expect(b.messages.at(-1)).toMatchObject({
      type: "error",
      code: "invalid-resume",
    });
    await f.send(a, homeHello(2), 1000);
    expect(a.closed?.[0]).toBe(1008);
    expect(f.homeSaves).toHaveLength(1);
  });
  it("gives concurrent tabs of one anonymous owner the same cabin and distinct player IDs", async () => {
    const f = fixture(),
      a = f.connect("tab-a"),
      b = f.connect("tab-b");
    await Promise.all([f.send(a, homeHello(1)), f.send(b, homeHello(1))]);
    expect(a.state!.home).toEqual(b.state!.home);
    expect(a.state!.player.id).not.toBe(b.state!.player.id);
    expect(f.homeSaves).toHaveLength(1);
  });
  it("does not commit a failed write and fails closed on corrupt persisted ownership", async () => {
    let fail = true;
    const homes = new HomeAssignments({
      save: async () => {
        if (fail) throw Error("Storage unavailable");
      },
    });
    await expect(homes.claim(token(1), true)).rejects.toThrow(
      "Storage unavailable",
    );
    fail = false;
    await expect(homes.claim(token(1), true)).resolves.toMatchObject({
      index: 0,
    });
    await expect(homes.claim(token(2), true)).resolves.toMatchObject({
      index: 1,
    });
    const duplicate = {
      version: 2,
      owners: [
        {
          digest: "a".repeat(64),
          index: 0,
          ownerName: null,
          pendingName: null,
          nameSince: 0,
        },
        {
          digest: "b".repeat(64),
          index: 0,
          ownerName: null,
          pendingName: null,
          nameSince: 0,
        },
      ],
    };
    expect(() => readHomeLedger(duplicate)).toThrow(
      "Invalid stored home ledger",
    );
  });
});

describe("room behavior", () => {
  it("sends snapshots and broadcasts presence with server-owned identities", async () => {
    const f = fixture(),
      a = f.connect("server-a"),
      b = f.connect("server-b");
    expect(b.messages[0]).toMatchObject({
      type: "snapshot",
      selfId: "server-b",
      version: 1,
      players: [{ id: "server-a" }, { id: "server-b" }],
    });
    expect(a.messages.at(-1)).toMatchObject({
      type: "joined",
      player: { id: "server-b" },
    });
    await f.send(a, {
      type: "pose",
      id: "server-b",
      pose: { ...pose, id: "server-b", seatId: "bench:seat:0" },
    });
    expect(b.messages.at(-1)).toEqual({
      type: "pose",
      player: { ...pose, id: "server-a", nickname: "Guest" },
    });
  });
  it("accepts fifty active connections and gives the next connection a generic busy error", () => {
    const f = fixture();
    expect(MAX_PLAYERS).toBe(50);
    for (let i = 0; i < MAX_PLAYERS; i++)
      expect(f.connect(String(i)).closed).toBeNull();
    const overflow = f.connect("overflow");
    expect(overflow.closed?.[0]).toBe(1008);
    expect(overflow.messages.at(-1)).toMatchObject({
      type: "error",
      code: "room-full",
      message: "The world is busy. Please try again shortly.",
    });
  });
  it("rejects duplicate seats, preserves an old claim on rejection, and releases on departure", async () => {
    const f = fixture(),
      a = f.connect("a"),
      b = f.connect("b");
    await f.send(a, { type: "seat", seatId: "bench:seat:0", requestId: "one" });
    await f.send(b, { type: "seat", seatId: "bench:seat:1", requestId: "two" });
    await f.send(b, {
      type: "seat",
      seatId: "bench:seat:0",
      requestId: "three",
    });
    expect(b.messages).toContainEqual(
      expect.objectContaining({
        type: "seat-result",
        requestId: "three",
        accepted: false,
        seatId: "bench:seat:1",
      }),
    );
    expect(b.state!.player.seatId).toBe("bench:seat:1");
    a.close(1000, "done");
    f.room.disconnect(a);
    expect(b.messages.at(-1)).toEqual({
      type: "seats",
      seats: { "bench:seat:1": "b" },
    });
    await f.send(b, {
      type: "seat",
      seatId: "bench:seat:0",
      requestId: "four",
    });
    expect(b.state!.player.seatId).toBe("bench:seat:0");
    await f.send(b, { type: "seat", seatId: null, requestId: "five" });
    expect(b.state!.player.seatId).toBeUndefined();
  });
  it("persists fire changes and reconstructs pose/seat/rate state after hibernation", async () => {
    const f = fixture(),
      a = f.connect("a");
    await f.send(a, {
      type: "seat",
      seatId: "bench:seat:0",
      requestId: "seat",
    });
    await f.send(a, { type: "pose", pose });
    await f.send(a, { type: "fire", lit: false });
    expect(f.saved).toEqual([{ lit: false, revision: 1 }]);
    const recovered = new RoomCore(f.runtime, f.saved[0]);
    await recovered.message(a, JSON.stringify({ type: "sync" }), 1000);
    expect(a.messages.at(-1)).toMatchObject({
      type: "snapshot",
      selfId: "a",
      fire: { lit: false, revision: 1 },
      seats: { "bench:seat:0": "a" },
      players: [{ ...pose, seatId: "bench:seat:0" }],
    });
  });
  it("limits sustained pose broadcasts and closes abusive packets", async () => {
    const f = fixture(),
      a = f.connect("a"),
      b = f.connect("b");
    b.messages = [];
    for (let i = 0; i < 20; i++) await f.send(a, { type: "pose", pose });
    expect(b.messages.filter((m) => m.type === "pose")).toHaveLength(3);
    await f.send(a, { type: "pose", pose }, 100);
    expect(b.messages.filter((m) => m.type === "pose")).toHaveLength(4);
    for (let i = 0; i < 3; i++)
      await f.room.message(a, new ArrayBuffer(5), 200);
    expect(a.closed?.[0]).toBe(1008);
  });
  it("reverts a failed fire write and sends the authoritative snapshot", async () => {
    const f = fixture(),
      a = f.connect("a");
    const room = new RoomCore({
      ...f.runtime,
      saveFire: async () => {
        throw Error("unavailable");
      },
    });
    await room.message(a, JSON.stringify({ type: "fire", lit: false }), 1000);
    expect(a.messages.at(-1)).toMatchObject({
      type: "snapshot",
      fire: { lit: true, revision: 0 },
    });
  });
});

describe("rebuilt player village", () => {
  it("requires the rebuilt housing generation and does not import random v1 ownership", async () => {
    const f = fixture(),
      old = f.connect("old-client");
    await f.send(old, { ...homeHello(1), housingEpoch: undefined });
    expect(old.messages.at(-1)).toMatchObject({
      type: "error",
      code: "world-updated",
    });
    expect(f.homeSaves).toHaveLength(0);
    expect(() => readHomeLedger({ version: 1, owners: [] })).toThrow();
  });
  it("creates only one durable cabin per owner and publishes it to every client", async () => {
    const f = fixture(),
      a = f.connect("a"),
      b = f.connect("b");
    await f.send(a, homeHello(1), 0);
    await f.send(b, homeHello(2), 0);
    expect(f.runtime.homes.publicCabins()).toEqual([
      { index: 0, ownerName: null },
      { index: 1, ownerName: null },
    ]);
    expect(a.messages).toContainEqual({
      type: "village",
      village: {
        epoch: HOUSING_EPOCH,
        cabins: [
          { index: 0, ownerName: null },
          { index: 1, ownerName: null },
        ],
      },
    });
    b.close(1000, "offline");
    f.room.disconnect(b);
    expect(f.runtime.homes.publicCabins()).toHaveLength(2);
    const returning = f.connect("returning");
    await f.send(returning, homeHello(2, false), 1000);
    expect(returning.state!.home!.index).toBe(1);
    expect(f.runtime.homes.publicCabins()).toHaveLength(2);
  });
  it("puts a name on the cabin only after five unchanged minutes, including after storage reload", async () => {
    let ledger: HomeLedger | undefined;
    const homes = new HomeAssignments({
      save: async (next) => {
        ledger = structuredClone(next);
      },
    });
    await homes.claim(token(1), true, "First name", 0);
    expect(homes.publicCabins()).toEqual([{ index: 0, ownerName: null }]);
    await homes.stageName(0, "Claudiu", 240_000);
    expect(await homes.commitDueNames(HOME_NAME_GRACE_MS)).toBe(false);
    const recovered = new HomeAssignments(
      {
        save: async (next) => {
          ledger = structuredClone(next);
        },
      },
      ledger,
    );
    expect(recovered.nextNameDeadline()).toBe(540_000);
    expect(await recovered.commitDueNames(539_999)).toBe(false);
    expect(await recovered.commitDueNames(540_000)).toBe(true);
    expect(recovered.publicCabins()).toEqual([
      { index: 0, ownerName: "Claudiu" },
    ]);
    await recovered.stageName(0, "Claudiu", 900_000);
    expect(recovered.nextNameDeadline()).toBeNull();
    await recovered.stageName(0, "Ștefan", 1_000_000);
    expect(recovered.publicCabins()[0].ownerName).toBe("Claudiu");
    await recovered.commitDueNames(1_300_000);
    expect(recovered.publicCabins()[0].ownerName).toBe("Ștefan");
    expect(JSON.stringify(recovered.publicCabins())).not.toContain("digest");
  });
  it("broadcasts committed signs and rejects seats belonging to unbuilt cabins", async () => {
    const f = fixture(),
      a = f.connect("a");
    await f.send(a, homeHello(1), 0);
    await f.room.commitNames(HOME_NAME_GRACE_MS);
    expect(a.messages.at(-1)).toMatchObject({
      type: "village",
      village: { cabins: [{ index: 0, ownerName: "Same nickname" }] },
    });
    await f.send(
      a,
      {
        type: "seat",
        seatId: "cabin-12:bench:porch:seat:0",
        requestId: "missing",
      },
      301_000,
    );
    expect(a.messages.at(-1)).toMatchObject({
      type: "seat-result",
      accepted: false,
    });
    await f.send(
      a,
      {
        type: "seat",
        seatId: "cabin-0:bench:porch:seat:0",
        requestId: "built",
      },
      302_000,
    );
    expect(a.state!.player.seatId).toBe("cabin-0:bench:porch:seat:0");
  });
});

it("does not publish a plaque name when its durable write fails", async () => {
  let fail = false;
  const homes = new HomeAssignments({
    save: async () => {
      if (fail) throw Error("storage failed");
    },
  });
  await homes.claim(token(1), true, "Clau", 0);
  fail = true;
  await expect(homes.commitDueNames(HOME_NAME_GRACE_MS)).rejects.toThrow(
    "storage failed",
  );
  expect(homes.publicCabins()[0].ownerName).toBeNull();
  fail = false;
  expect(await homes.commitDueNames(HOME_NAME_GRACE_MS)).toBe(true);
  expect(homes.publicCabins()[0].ownerName).toBe("Clau");
});

describe("playful punches", () => {
  it("hits only the closest eligible player in front, and enforces stun, cooldown and immunity", async () => {
    const f = fixture();
    const a = f.connect("a"),
      b = f.connect("b"),
      c = f.connect("c");
    for (const player of [a, b, c])
      await f.send(player, { type: "hello", nickname: "Friend" });
    const position = async (
      player: FakeConnection,
      pos: [number, number, number],
      changes: Partial<PlayerPose> = {},
    ) =>
      f.send(
        player,
        {
          type: "pose",
          pose: {
            ...pose,
            animation: "Idle_Neutral",
            position: pos,
            yaw: 0,
            ...changes,
          },
        },
        100,
      );
    await position(a, [0, 0, 0]);
    await position(b, [0, 0, 1]);
    await position(c, [0, 0, 1.7]);
    await f.send(a, { type: "punch" }, 200);
    expect(a.messages.at(-1)).toEqual({
      type: "punch",
      attackerId: "a",
      targetId: "b",
    });
    expect(b.messages.at(-1)).toEqual(a.messages.at(-1));
    expect(b.state?.stunnedUntil).toBe(2200);
    const count = a.messages.length;
    await f.send(b, { type: "punch" }, 1000);
    await f.send(a, { type: "punch" }, 1000);
    expect(a.messages.length).toBe(count);
    await f.send(a, { type: "punch" }, 1500);
    expect(a.messages.at(-1)).toEqual({
      type: "punch",
      attackerId: "a",
      targetId: "c",
    });
    await f.send(a, { type: "punch" }, 2800);
    expect(a.messages.at(-1)).toEqual({
      type: "punch",
      attackerId: "a",
      targetId: null,
    });
    await f.send(a, { type: "punch" }, 4100);
    expect(a.messages.at(-1)).toEqual({
      type: "punch",
      attackerId: "a",
      targetId: "b",
    });
  });
  it("misses behind, out of range, different heights, and protects seated or swimming players", async () => {
    for (const [pos, changes] of [
      [[0, 0, -1], {}],
      [[0, 0, 2.1], {}],
      [[0, 1.5, 1], {}],
      [[0, 0, 1], { activity: "sit" }],
      [[0, 0, 1], { animation: "Swim_Idle" }],
      [[0, 0, 1], { vehicle: "scooter" }],
    ] as [PlayerPose["position"], Partial<PlayerPose>][]) {
      const f = fixture(),
        a = f.connect("a"),
        b = f.connect("b");
      await f.send(a, { type: "hello", nickname: "A" });
      await f.send(b, { type: "hello", nickname: "B" });
      await f.send(
        a,
        { type: "pose", pose: { ...pose, position: [0, 0, 0], yaw: 0 } },
        100,
      );
      await f.send(
        b,
        { type: "pose", pose: { ...pose, position: pos, ...changes } },
        100,
      );
      await f.send(a, { type: "punch" }, 200);
      expect(a.messages.at(-1)).toEqual({
        type: "punch",
        attackerId: "a",
        targetId: null,
      });
    }
  });
});

describe("input activity presence", () => {
  it("broadcasts bounded activity, retains idle age in snapshots and does not depend on pose packets", async () => {
    const f = fixture(),
      a = f.connect("a"),
      b = f.connect("b");
    await f.send(a, { type: "hello", nickname: "A" });
    await f.send(b, { type: "hello", nickname: "B" });
    await f.send(a, { type: "activity", idleMs: 1200 }, 5000);
    expect(b.messages.at(-1)).toEqual({
      type: "activity",
      id: "a",
      idleMs: 1200,
    });
    const messages = b.messages.length;
    await f.send(a, { type: "activity", idleMs: 0 }, 5500);
    expect(b.messages.length).toBe(messages);
    f.room.snapshot(b, 183800);
    const snapshot = b.messages.at(-1);
    expect(snapshot?.type).toBe("snapshot");
    if (snapshot?.type === "snapshot") {
      expect(snapshot.serverTime).toBe(183800);
      expect(snapshot.players.find((player) => player.id === "a")?.idleMs).toBe(
        180000,
      );
      expect(
        snapshot.players.find((player) => player.id === "b")?.idleMs,
      ).toBeUndefined();
    }
    await f.send(a, { type: "activity", idleMs: 0 }, 184000);
    expect(b.messages.at(-1)).toEqual({ type: "activity", id: "a", idleMs: 0 });
    await f.send(a, { type: "activity", idleMs: 180000 }, 200000);
    await f.send(a, { type: "activity", idleMs: 0 }, 200100);
    expect(b.messages.at(-1)).toEqual({ type: "activity", id: "a", idleMs: 0 });
    expect(
      parseClientMessage(JSON.stringify({ type: "activity", idleMs: -1 })),
    ).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: "activity", idleMs: 180001 })),
    ).toBeNull();
  });
});

describe("shared weather messages", () => {
  it("sends updates and restores current conditions to late joiners", async () => {
    const f = fixture(),
      a = f.connect("weather-a"),
      b = f.connect("weather-b");
    const weather = {
      cloudCover: 82,
      weatherCode: 3,
      observedAt: 1000,
      fetchedAt: 2000,
    };
    f.room.setWeather(weather);
    expect(a.messages.at(-1)).toEqual({ type: "weather", weather });
    expect(b.messages.at(-1)).toEqual({ type: "weather", weather });
    f.room.snapshot(b, 3000);
    expect(b.messages.at(-1)).toMatchObject({ type: "snapshot", weather });
    const count = a.messages.length;
    f.room.setWeather({ ...weather });
    expect(a.messages.length).toBe(count);
    f.room.setWeather(null);
    expect(a.messages.at(-1)).toEqual({ type: "weather", weather: null });
    expect(
      parseClientMessage(JSON.stringify({ type: "weather-refresh" })),
    ).toEqual({ type: "weather-refresh" });
  });
});
