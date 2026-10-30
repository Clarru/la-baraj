import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
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
import { PlanesTable, type PlanesRecord } from "../apps/server/planes-table";
import { randomFleet } from "../packages/shared/planes";
import { HOUSING_EPOCH, type ServerMessage } from "../packages/shared/protocol";
import type { SessionState } from "../apps/server/room-core";

class Storage {
  data = new Map<string, unknown>();
  alarm: number | null = 61000;
  fail = false;
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown) {
    if (this.fail) throw Error("storage outage");
    this.data.set(key, structuredClone(value));
  }
  async getAlarm() {
    return this.alarm;
  }
  async setAlarm(time: number) {
    if (this.fail) throw Error("storage outage");
    this.alarm = time;
  }
  async deleteAlarm() {
    this.alarm = null;
  }
  async transaction<T>(callback: (tx: Storage) => Promise<T>) {
    const staged = new Storage();
    staged.data = structuredClone(this.data);
    staged.alarm = this.alarm;
    staged.fail = this.fail;
    const result = await callback(staged);
    this.data = staged.data;
    this.alarm = staged.alarm;
    return result;
  }
}
function connection(side: 0 | 1) {
  const messages: ServerMessage[] = [];
  return {
    state: {
      housingEpoch: HOUSING_EPOCH,
      nameAt: 1000,
      home: { index: side, resumeToken: (side ? "b" : "a").repeat(43) },
      player: {
        id: side ? "bob" : "alice",
        nickname: side ? "Bob" : "Alice",
        position: [0, 0, 0],
        yaw: 0,
        animation: "Activity_Sit",
        activity: "sit",
        vehicle: "none",
        seatId: side ? "planes-south:seat:0" : "planes-north:seat:0",
      },
      all: { tokens: 30, at: 1000 },
      pose: { tokens: 3, at: 1000 },
      action: { tokens: 5, at: 1000 },
      violations: 0,
    } as SessionState,
    setState(state: SessionState) {
      this.state = structuredClone(state);
    },
    send(raw: string) {
      messages.push(JSON.parse(raw));
    },
    close: vi.fn(),
    messages,
  };
}
async function fixture(live = true) {
  let record: PlanesRecord | undefined;
  const table = new PlanesTable({
    save: async (next) => {
      record = structuredClone(next);
    },
    random: () => 0.3,
  });
  const actors = [
    { owner: "home:2:0", socket: "alice", name: "Alice" },
    { owner: "home:2:1", socket: "bob", name: "Bob" },
  ];
  for (const side of [0, 1] as const)
    await table.join(actors[side], side, 1000);
  for (const actor of actors)
    await table.act(
      actor,
      { kind: "ready", planes: randomFleet(() => 0.3) },
      `ready-${actor.socket}`,
      table.view(actor).revision,
      1000,
    );
  const storage = new Storage();
  storage.data.set("planes-table-v1", record);
  storage.data.set("fire", { lit: true, revision: 26 });
  storage.data.set("home-owners-v2", {
    version: 2,
    owners: [
      {
        digest: "1".repeat(64),
        index: 0,
        ownerName: null,
        pendingName: "Alice",
        nameSince: 1000,
      },
      {
        digest: "2".repeat(64),
        index: 1,
        ownerName: "Bob",
        pendingName: null,
        nameSince: 1000,
      },
    ],
  });
  const connections = live ? [connection(0), connection(1)] : [];
  const world = new WorldRoom({ storage, connections } as never, {} as never);
  await world.onStart();
  return { world, storage, connections };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
afterEach(() => {
  vi.useRealTimers();
});
describe("actual Worker lifecycle with durable storage", () => {
  it("expires a turn without player traffic, releases its chair and retains the later name-plaque alarm", async () => {
    const { world, storage, connections } = await fixture();
    const original = (await storage.get<PlanesRecord>(
      "planes-table-v1",
    ))!.members.map((member) => member?.planes ?? null);
    vi.setSystemTime(61000);
    await world.onAlarm();
    expect(await storage.get("planes-table-v1")).toMatchObject({
      phase: "finished",
      winner: 1,
      reason: "timeout",
      deadline: null,
    });
    expect(
      (await storage.get<PlanesRecord>("planes-table-v1"))!.completedPlanes,
    ).toEqual(original);
    for (const connection of connections) {
      const message = connection.messages
        .filter((message) => message.type === "planes")
        .at(-1);
      expect(
        message?.type === "planes" ? message.view.revealedPlanes : null,
      ).toEqual(original);
    }
    expect(connections[0].state.player.seatId).toBeUndefined();
    expect(storage.alarm).toBe(301000);
    vi.setSystemTime(301000);
    await world.onAlarm();
    const homes = await storage.get<{ owners: { ownerName: string | null }[] }>(
      "home-owners-v2",
    );
    expect(homes!.owners[0].ownerName).toBe("Alice");
    expect(storage.alarm).toBeNull();
    expect(await storage.get("fire")).toEqual({ lit: true, revision: 26 });
    expect(homes!.owners).toHaveLength(2);
  });
  it("reconciles missing sockets after a wake and expires both abandoned roles", async () => {
    const { world, storage } = await fixture(false);
    expect(storage.alarm).toBe(31000);
    vi.setSystemTime(31000);
    await world.onAlarm();
    expect(await storage.get("planes-table-v1")).toMatchObject({
      phase: "lobby",
      members: [null, null],
    });
    expect(storage.alarm).toBe(301000);
  });
  it("re-arms the genuine turn deadline after an earlier recovery alarm", async () => {
    const { world, storage } = await fixture();
    storage.alarm = 2000;
    vi.setSystemTime(2000);
    await world.onAlarm();
    expect(storage.alarm).toBe(61000);
    expect(await storage.get("planes-table-v1")).toMatchObject({
      phase: "playing",
    });
  });
  it("propagates an alarm storage outage for platform retry, then commits it once storage recovers", async () => {
    const { world, storage } = await fixture();
    storage.fail = true;
    vi.setSystemTime(61000);
    await expect(world.onAlarm()).rejects.toThrow("storage outage");
    expect(await storage.get("planes-table-v1")).toMatchObject({
      phase: "playing",
    });
    storage.fail = false;
    vi.setSystemTime(61001);
    await world.onAlarm();
    expect(await storage.get("planes-table-v1")).toMatchObject({
      phase: "finished",
      reason: "timeout",
    });
    expect(storage.alarm).toBe(301000);
  });
  it("does not postpone the game alarm when an owner changes their cabin sign", async () => {
    const { world, storage, connections } = await fixture();
    vi.setSystemTime(10000);
    await world.onMessage(
      connections[0] as never,
      JSON.stringify({
        type: "hello",
        nickname: "Alice renamed",
        housingEpoch: 2,
        requestHome: true,
        resumeToken: "a".repeat(43),
      }),
    );
    expect(storage.alarm).toBe(61000);
    expect(await storage.get("planes-table-v1")).toMatchObject({
      members: [{ name: "Alice renamed" }, { name: "Bob" }],
    });
  });
});

describe("weather in the actual Worker lifecycle", () => {
  it("fetches once, broadcasts to connected players, and restores the shared cache after wake", async () => {
    const storage = new Storage();
    const connections = [connection(0)];
    const pending: Promise<unknown>[] = [];
    const ctx = {
      storage,
      connections,
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    };
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            current: {
              time: "1970-01-01T00:00",
              cloud_cover: 85,
              weather_code: 3,
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    try {
      const world = new WorldRoom(ctx as never, {} as never);
      await world.onStart();
      world.onConnect(connections[0] as never);
      await Promise.all(pending.splice(0));
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(connections[0].messages).toContainEqual({
        type: "weather",
        weather: {
          cloudCover: 85,
          weatherCode: 3,
          observedAt: 0,
          fetchedAt: 1000,
        },
      });
      await world.onMessage(
        connections[0] as never,
        JSON.stringify({ type: "weather-refresh" }),
      );
      await Promise.all(pending.splice(0));
      expect(fetcher).toHaveBeenCalledTimes(1);
      const recovered = new WorldRoom(ctx as never, {} as never);
      await recovered.onStart();
      const guest = connection(1);
      connections.push(guest);
      recovered.onConnect(guest as never);
      await Promise.all(pending.splice(0));
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(guest.messages.find((m) => m.type === "snapshot")).toMatchObject({
        weather: { cloudCover: 85, weatherCode: 3 },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
