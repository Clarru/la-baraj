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
import { ARCADE_STATION } from "../packages/shared/arcade2048-station";
class Storage {
  data = new Map<string, unknown>();
  alarm: number | null = null;
  async get<T>(key: string) {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown) {
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
