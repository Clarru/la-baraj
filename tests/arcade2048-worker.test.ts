import { it, expect, vi } from "vitest";
vi.mock("partyserver", () => ({
  Server: class {
    name = "27f6361b353f4b5db885fd37fac89eda";
    constructor(readonly ctx: { connections: unknown[] }) {}
    getConnections() {
      return this.ctx.connections;
    }
  },
  routePartykitRequest: vi.fn(),
}));
import { WorldRoom } from "../apps/server/index";
import { HOUSING_EPOCH, type ServerMessage } from "../packages/shared/protocol";
import type { SessionState } from "../apps/server/room-core";
import {
  ARCADE_STATION,
  ARCADE_STATIONS,
} from "../packages/shared/arcade2048-station";
import {
  ARCADE_DAILY_WRITE_LIMIT,
  type ArcadeRecord,
} from "../apps/server/arcade2048";
class Storage {
  data = new Map<string, unknown>();
  alarm: number | null = null;
  beforePut?: (key: string) => Promise<void>;
  async get<T>(key: string) {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown) {
    await this.beforePut?.(key);
    this.data.set(key, structuredClone(value));
  }
  async list({ prefix }: { prefix: string }) {
    return new Map(
      [...this.data]
        .filter(([key]) => key.startsWith(prefix))
        .map(([k, v]) => [k, structuredClone(v)]),
    );
  }
  async transaction<T>(callback: (tx: Storage) => Promise<T>) {
    return callback(this);
  }
  async getAlarm() {
    return this.alarm;
  }
  async setAlarm(n: number) {
    this.alarm = n;
  }
  async deleteAlarm() {
    this.alarm = null;
  }
}
function client(index: number) {
  const messages: ServerMessage[] = [];
  return {
    state: {
      housingEpoch: HOUSING_EPOCH,
      nameAt: 1000,
      home: { index, resumeToken: "a".repeat(43) },
      player: {
        id: `player-${index}`,
        nickname: `Player ${index}`,
        position: [ARCADE_STATION.x, 1, ARCADE_STATION.z + 1],
        yaw: 0,
        animation: "Idle",
        activity: "none",
        vehicle: "none",
      },
      all: { tokens: 30, at: Date.now() },
      pose: { tokens: 3, at: Date.now() },
      action: { tokens: 5, at: Date.now() },
      violations: 0,
    } as SessionState,
    setState(s: SessionState) {
      this.state = structuredClone(s);
    },
    send(raw: string) {
      messages.push(JSON.parse(raw));
    },
    close: vi.fn(),
    messages,
  };
}
it("actual Worker restores personal boards after hibernation, advertises capability, and sends no private boards to others", async () => {
  const storage = new Storage(),
    a = client(0),
    b = client(1),
    ctx = { storage, connections: [a, b] };
  const world = new WorldRoom(ctx as never, {} as never);
  await world.onStart();
  await world.onMessage(a as never, JSON.stringify({ type: "sync" }));
  expect(a.messages.find((m) => m.type === "snapshot")).toMatchObject({
    features: { arcade2048: true },
  });
  const request = (id: string, kind: string, revision = 0) =>
    JSON.stringify({
      type: "arcade2048-action",
      requestId: id,
      revision,
      action: { kind, direction: "left", score: 999999 },
    });
  await world.onMessage(a as never, request("start", "resume"));
  const before = a.messages.filter((m) => m.type === "arcade2048").at(-1)!;
  expect(
    before.type === "arcade2048" && before.view.game?.board.filter(Boolean),
  ).toHaveLength(2);
  expect(b.messages.filter((m) => m.type === "arcade2048")).toHaveLength(0);
  const saved = [...storage.data.keys()].filter((k) =>
    k.startsWith("arcade2048-v1:"),
  );
  expect(saved).toEqual([
    `arcade2048-v1:${HOUSING_EPOCH}:home:${HOUSING_EPOCH}:0`,
  ]);
  const awake = new WorldRoom(ctx as never, {} as never);
  await awake.onStart();
  await awake.onMessage(a as never, request("restore", "resume"));
  const restored = a.messages.filter((m) => m.type === "arcade2048").at(-1)!;
  expect(restored.type === "arcade2048" && restored.view).toEqual(
    before.type === "arcade2048" && before.view,
  );
  b.state.player.position = [0, 0, 0];
  await awake.onMessage(b as never, request("remote", "resume"));
  const denied = b.messages.filter((m) => m.type === "arcade2048").at(-1)!;
  expect(denied).toMatchObject({
    error: "Walk up to the arcade to play.",
    view: { game: null },
  });
  expect(
    [...storage.data.keys()].filter((k) => k.startsWith("arcade2048-v1:")),
  ).toHaveLength(1);
});

it("isolates a persisted exhausted arcade budget from other world writes", async () => {
  const storage = new Storage(),
    a = client(0),
    owner = `home:${HOUSING_EPOCH}:0`;
  const key = `arcade2048-v1:${HOUSING_EPOCH}:${owner}`;
  const row: ArcadeRecord = {
    version: 1,
    owner,
    name: a.state.player.nickname,
    game: {
      board: [2, 2, ...Array(14).fill(0)],
      score: 0,
      moves: 0,
      revision: 1,
      continued: false,
    },
    best: 0,
    bestTile: 2,
    bestAt: 0,
    requests: [],
    writeBudget: {
      day: Math.floor(Date.now() / 86400000),
      count: ARCADE_DAILY_WRITE_LIMIT,
    },
  };
  await storage.put(key, row);
  const world = new WorldRoom(
    { storage, connections: [a] } as never,
    {} as never,
  );
  await world.onStart();
  const action = (id: string, kind: string) =>
    JSON.stringify({
      type: "arcade2048-action",
      requestId: id,
      revision: 1,
      action: { kind, direction: "left" },
    });
  await world.onMessage(a as never, action("blocked", "move"));
  expect(
    a.messages.filter((m) => m.type === "arcade2048").at(-1),
  ).toMatchObject({
    error: expect.stringContaining("Saving is paused"),
    view: { game: row.game, best: 0 },
  });
  expect(await storage.get(key)).toEqual(row);
  await world.onMessage(a as never, action("read", "resume"));
  const resume = a.messages.filter((m) => m.type === "arcade2048").at(-1)!;
  expect(resume.type === "arcade2048" && resume.error).toBeUndefined();
  await world.onMessage(
    a as never,
    JSON.stringify({ type: "fire", lit: false }),
  );
  expect(await storage.get("fire")).toEqual({ lit: false, revision: 1 });
  expect(a.close).not.toHaveBeenCalled();
});

const stationRequest = (
  requestId: string,
  stationId: number,
  kind = "resume",
  revision = 0,
) =>
  JSON.stringify({
    type: "arcade2048-action",
    requestId,
    stationId,
    revision,
    action: { kind, direction: "left" },
  });
const reply = (c: ReturnType<typeof client>) =>
  c.messages.filter((m) => m.type === "arcade2048").at(-1)! as Extract<
    ServerMessage,
    { type: "arcade2048" }
  >;
const updates = (c: ReturnType<typeof client>) =>
  c.messages.filter((m) => m.type === "arcade-stations") as Extract<
    ServerMessage,
    { type: "arcade-stations" }
  >[];
function atStation(c: ReturnType<typeof client>, id: number) {
  const s = ARCADE_STATIONS[id];
  c.state.player.position = [s.x, 1, s.z + 1];
}
it("reserves atomically, blocks a second player before entry, and broadcasts only the occupied public board", async () => {
  const storage = new Storage(),
    a = client(0),
    b = client(1),
    ctx = { storage, connections: [a, b] },
    world = new WorldRoom(ctx as never, {} as never);
  await world.onStart();
  atStation(a, 0);
  atStation(b, 0);
  await Promise.all([
    world.onMessage(a as never, stationRequest("claim-a", 0)),
    world.onMessage(b as never, stationRequest("claim-b", 0)),
  ]);
  expect(a.state.arcadeStation).toBe(0);
  expect(b.state.arcadeStation).toBeUndefined();
  expect(reply(b)).toMatchObject({
    stationBlocked: true,
    error: expect.stringContaining("Occupied by Player 0"),
    view: { game: null },
  });
  const board = reply(a).view.game!;
  expect(
    updates(b)
      .flatMap((m) => m.stations)
      .findLast((s) => s.id === 0),
  ).toMatchObject({
    id: 0,
    playerId: "player-0",
    name: "Player 0",
    game: board,
  });
  const publicRaw = JSON.stringify(updates(b));
  for (const forbidden of [
    "resumeToken",
    "writeBudget",
    "requests",
    "home:2:0",
    "arcadeClaim",
    "claim-a",
    "a".repeat(43),
  ])
    expect(publicRaw).not.toContain(forbidden);
  expect(b.messages.filter((m) => m.type === "arcade2048")).toHaveLength(1);
  const before = structuredClone([...storage.data]);
  await world.onMessage(
    b as never,
    stationRequest("steal-move", 0, "move", board.revision),
  );
  expect(reply(b).stationBlocked).toBe(true);
  expect([...storage.data]).toEqual(before);
  await world.onMessage(b as never, stationRequest("wrong-leave", 0, "leave"));
  expect(a.state.arcadeStation).toBe(0);
  await world.onMessage(
    a as never,
    stationRequest("move-a", 0, "move", board.revision),
  );
  const changed = updates(b).at(-1)!;
  expect(changed.stations).toHaveLength(1);
  expect(changed.stations[0]).toMatchObject({
    id: 0,
    direction: "left",
    game: reply(a).view.game,
  });
});
it("supports three independent personal games, survives hibernation, and releases on leave and disconnect without saving seats", async () => {
  const storage = new Storage(),
    clients = [client(0), client(1), client(2)],
    ctx = { storage, connections: clients };
  let world = new WorldRoom(ctx as never, {} as never);
  await world.onStart();
  for (const [id, c] of clients.entries()) {
    atStation(c, id);
    await world.onMessage(c as never, stationRequest(`start-${id}`, id));
  }
  expect(clients.map((c) => c.state.arcadeStation)).toEqual([0, 1, 2]);
  expect(
    [...storage.data.keys()].filter((k) => k.startsWith("arcade2048-v1:")),
  ).toHaveLength(3);
  const saved = structuredClone([...storage.data]);
  world = new WorldRoom(ctx as never, {} as never);
  await world.onStart();
  await world.onMessage(clients[2] as never, JSON.stringify({ type: "sync" }));
  const snapshot = clients[2].messages
    .filter((m) => m.type === "snapshot")
    .at(-1)! as Extract<ServerMessage, { type: "snapshot" }>;
  expect(snapshot.features).toMatchObject({ arcadeStations: true });
  expect(snapshot.arcadeStations?.map((s) => s.playerId)).toEqual([
    "player-0",
    "player-1",
    "player-2",
  ]);
  await world.onMessage(
    clients[0] as never,
    stationRequest("leave-a", 0, "leave"),
  );
  expect(clients[0].state.arcadeStation).toBeUndefined();
  expect(
    updates(clients[1])
      .at(-1)
      ?.stations.find((s) => s.id === 0),
  ).toMatchObject({ playerId: null, game: null });
  const departed = ctx.connections.splice(1, 1)[0];
  await world.onClose(departed as never);
  expect(
    updates(clients[1])
      .at(-1)
      ?.stations.find((s) => s.id === 1),
  ).toMatchObject({ playerId: null, game: null });
  expect([...storage.data]).toEqual(saved);
  atStation(clients[0], 0);
  await world.onMessage(clients[0] as never, stationRequest("return-a", 0));
  expect(reply(clients[0]).view.game).toEqual(snapshot.arcadeStations![0].game);
});
it("releases when walking away or sitting, and prevents one owner occupying two cabinets through another tab", async () => {
  const storage = new Storage(),
    a = client(0),
    b = client(1),
    ctx = { storage, connections: [a, b] },
    world = new WorldRoom(ctx as never, {} as never);
  await world.onStart();
  atStation(a, 0);
  atStation(b, 1);
  b.state.home.index = 0;
  await world.onMessage(a as never, stationRequest("own-a", 0));
  await world.onMessage(b as never, stationRequest("own-other-tab", 1));
  expect(reply(b)).toMatchObject({
    stationBlocked: true,
    error: expect.stringContaining("another cabinet or tab"),
  });
  await world.onMessage(
    a as never,
    JSON.stringify({
      type: "pose",
      pose: {
        position: [ARCADE_STATIONS[0].x + 5, 1, ARCADE_STATIONS[0].z + 1],
        yaw: 0,
        animation: "Walk",
        activity: "none",
        vehicle: "none",
      },
    }),
  );
  expect(a.state.arcadeStation).toBeUndefined();
  atStation(a, 0);
  await world.onMessage(a as never, stationRequest("again-a", 0));
  await world.onMessage(
    a as never,
    JSON.stringify({
      type: "seat",
      requestId: "sit",
      seatId: "campfire:seat:0",
    }),
  );
  expect(a.state.arcadeStation).toBeUndefined();
});
it("does not leave a phantom reservation on storage failure, or let an older failed claim release a newer one", async () => {
  const storage = new Storage(),
    a = client(0),
    ctx = { storage, connections: [a] },
    world = new WorldRoom(ctx as never, {} as never);
  await world.onStart();
  atStation(a, 0);
  storage.beforePut = async (key) => {
    if (key.startsWith("arcade2048-v1:")) throw Error("save failed");
  };
  await world.onMessage(a as never, stationRequest("fail", 0));
  expect(reply(a)).toMatchObject({
    stationBlocked: true,
    view: { game: null },
  });
  expect(a.state.arcadeStation).toBeUndefined();
  let reject!: (e: Error) => void,
    entered = false;
  const gate = new Promise<void>((_, r) => {
    reject = r;
  });
  storage.beforePut = async (key) => {
    if (key.startsWith("arcade2048-v1:") && !entered) {
      entered = true;
      await gate;
    }
  };
  const old = world.onMessage(a as never, stationRequest("reused", 0));
  await vi.waitFor(() => expect(entered).toBe(true));
  const oldClaim = a.state.arcadeClaim;
  await world.onMessage(a as never, stationRequest("leave-old", 0, "leave"));
  const fresh = world.onMessage(a as never, stationRequest("reused", 0));
  await vi.waitFor(() => {
    expect(a.state.arcadeClaim).toBeDefined();
    expect(a.state.arcadeClaim).not.toBe(oldClaim);
  });
  const freshClaim = a.state.arcadeClaim;
  expect(freshClaim).not.toBe("reused");
  reject(Error("old save failed"));
  await old;
  await fresh;
  expect(a.state.arcadeStation).toBe(0);
  expect(a.state.arcadeClaim).toBe(freshClaim);
  expect(reply(a).error).toBeUndefined();
  expect(reply(a).view.game?.board.filter(Boolean)).toHaveLength(2);
});
