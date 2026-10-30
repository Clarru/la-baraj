import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { sockets, storageData } = vi.hoisted(() => ({
  sockets: [] as FakeSocket[],
  storageData: new Map<string, string>(),
}));
type FakeSocket = EventTarget & {
  options: Record<string, unknown>;
  readyState: number;
  sent: Record<string, unknown>[];
  open(): void;
  receive(message: unknown): void;
  close(): void;
};
vi.mock("partysocket", () => ({
  default: class extends EventTarget {
    readyState = 0;
    sent: Record<string, unknown>[] = [];
    constructor(readonly options: Record<string, unknown>) {
      super();
      sockets.push(this);
    }
    send(raw: string) {
      this.sent.push(JSON.parse(raw));
    }
    open() {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    }
    receive(message: unknown) {
      this.dispatchEvent(
        new MessageEvent("message", { data: JSON.stringify(message) }),
      );
    }
    close() {
      this.readyState = 3;
      this.dispatchEvent(new Event("close"));
    }
  },
}));
import { freshCruce, type CruceView } from "../../../packages/shared/cruce";
import { syncWorldTime } from "./day-night";
import { MultiplayerRoom, vehicleKind } from "./multiplayer";
import {
  queueCabinTransfer,
  takeCabinTransfer,
  sampleCabinMotion,
} from "./cabin-interior-state";
import {
  CANONICAL_WORLD_ID,
  parseClientMessage,
} from "../../../packages/shared/protocol";
const roomId = CANONICAL_WORLD_ID;
const self = {
  id: "self-1",
  nickname: "Me",
  position: [45, 2, 27],
  yaw: 0,
  animation: "Idle_Neutral",
  activity: "none",
  vehicle: "none",
};
const friend = { ...self, id: "friend-1", nickname: "Friend" };
const sample = {
  feet: [45, 2, 27],
  facing: [0, 0, 1],
  animation: "Walk",
  activity: "none",
  velocity: [0, 0, 3],
  jumpPhase: "grounded",
  vehicle: null,
};
function snapshot(socket: FakeSocket, selfId = "self-1", homeIndex = 14) {
  const hello = [...socket.sent]
    .reverse()
    .find((message) => message.type === "hello")!;
  socket.receive({
    type: "snapshot",
    version: 1,
    selfId,
    players: [{ ...self, id: selfId, homeIndex }, friend],
    fire: { lit: true, revision: 0 },
    seats: {},
    home: { index: homeIndex, resumeToken: hello.resumeToken },
  });
}
beforeEach(() => {
  sockets.length = 0;
  storageData.clear();
  vi.stubEnv("VITE_ROOM_SERVER_URL", "https://rooms.example.test");
  vi.stubGlobal("location", {
    href: `https://lake.example.test/?room=${roomId}`,
  });
  vi.stubGlobal("history", { replaceState: vi.fn() });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storageData.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storageData.set(key, value);
    },
  });
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  vi.spyOn(performance, "now").mockReturnValue(1000);
  syncWorldTime(Date.now());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("friends room client", () => {
  it("requests bounded authoritative sync when a completed Cruce trick stalls and cancels after recovery", () => {
    vi.useFakeTimers();
    const start = 1700000000000;
    vi.setSystemTime(start);
    vi.spyOn(performance, "now").mockImplementation(
      () => Date.now() - start + 1000,
    );
    syncWorldTime(start);
    const room = new MultiplayerRoom(),
      stop = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    const view = {
      ...freshCruce({ mode: "duel", target: 11, iber: false, cheating: false }),
      version: 1,
      revision: 10,
      you: 0,
      hand: [1],
      handCounts: [7, 0, 7, 0],
      stockCount: 4,
      legalCards: [],
      host: 0,
      deadline: start + 1800,
      phase: "trick",
      trick: [
        { seat: 0, card: 5, announcement: 0 },
        { seat: 2, card: 23, announcement: 0 },
      ],
      players: [
        { name: "Me", online: true, ready: false, awayUntil: null },
        null,
        { name: "Friend", online: true, ready: false, awayUntil: null },
        null,
      ],
    } as CruceView;
    socket.receive({ type: "cruce", view });
    const initial = socket.sent.filter((m) => m.type === "sync").length;
    vi.advanceTimersByTime(3400);
    expect(socket.sent.filter((m) => m.type === "sync")).toHaveLength(
      initial + 1,
    );
    socket.receive({
      type: "cruce",
      view: {
        ...view,
        phase: "playing",
        revision: 11,
        trick: [],
        deadline: Date.now() + 60000,
      },
    });
    vi.advanceTimersByTime(15000);
    expect(socket.sent.filter((m) => m.type === "sync")).toHaveLength(
      initial + 1,
    );
    stop();
  });

  it("applies each numbered boat correction once and acknowledges the latest result", () => {
    const room = new MultiplayerRoom(),
      stop = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    const boat = { position: [45, 27], yaw: 0, velocity: [0, 6] };
    room.publishMotion({
      ...sample,
      vehicle: "Motorboat",
      vehicleSpeed: 6,
      boat,
    });
    socket.receive({
      type: "boat-impact",
      revision: 2,
      boat: { ...boat, velocity: [2, 1] },
    });
    socket.receive({ type: "boat-impact", revision: 1, boat });
    expect(room.takeBoatImpact()?.revision).toBe(2);
    expect(room.takeBoatImpact()).toBeNull();
    socket.receive({ type: "boat-impact", revision: 2, boat });
    expect(room.takeBoatImpact()).toBeNull();
    vi.spyOn(performance, "now").mockReturnValue(1400);
    room.publishMotion({
      ...sample,
      vehicle: "Motorboat",
      vehicleSpeed: 1,
      boat: { ...boat, velocity: [2, 1] },
    });
    const packet = socket.sent.filter((m) => m.type === "pose").at(-1)!;
    expect(packet.pose).toMatchObject({
      boatImpactRevision: 2,
      boat: { velocity: [2, 1] },
    });
    expect(parseClientMessage(JSON.stringify(packet))).toEqual(packet);
    stop();
  });
  it("retains moored boat presence during an ordinary on-foot pose update", () => {
    const room = new MultiplayerRoom(),
      stop = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    const boat = { position: [3.7, 40], yaw: Math.PI, velocity: [0, 0] };
    room.publishMotion({ ...sample, boat });
    vi.spyOn(performance, "now").mockReturnValue(1400);
    room.publishMotion({ ...sample, feet: [46, 2, 27] });
    expect(
      socket.sent.filter((m) => m.type === "pose").at(-1)!.pose,
    ).toMatchObject({ vehicle: "none", boat, boatImpactRevision: 0 });
    stop();
  });
  it.each(["Swim_Forward", "Swim_Idle"])(
    "publishes %s through the existing pose contract",
    (animation) => {
      const room = new MultiplayerRoom();
      const disconnect = room.connect(),
        socket = sockets[0];
      socket.open();
      snapshot(socket);
      room.publishMotion({
        ...sample,
        animation,
        feet: [10, 0.1, 12],
        velocity: [0, 0, 2],
      });
      const packet = socket.sent.find((message) => message.type === "pose")!;
      expect(packet).toMatchObject({
        type: "pose",
        pose: { animation, vehicle: "none" },
      });
      expect(parseClientMessage(JSON.stringify(packet))).toEqual(packet);
      disconnect();
    },
  );
  it("maps vehicle names to pose vehicle kinds", () => {
    expect(vehicleKind("Motorboat")).toBe("boat");
    expect(vehicleKind("QuickVolt 9")).toBe("scooter");
    expect(vehicleKind(null)).toBe("none");
  });
  it("publishes a motorboat as a boat pose with its speed", () => {
    const room = new MultiplayerRoom();
    const disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    room.publishMotion({
      ...sample,
      vehicle: "Motorboat",
      vehicleSpeed: 6.5,
    });
    const packet = socket.sent.find((message) => message.type === "pose")!;
    expect(packet.pose).toMatchObject({ vehicle: "boat", speed: 6.5 });
    expect(parseClientMessage(JSON.stringify(packet))).toEqual(packet);
    disconnect();
  });
  it("publishes and validates an explicit lowered posture", () => {
    const room = new MultiplayerRoom();
    const disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    room.publishMotion({ ...sample, posture: "crouching" });
    const packet = socket.sent.find((message) => message.type === "pose")!;
    const pose = packet.pose as Record<string, unknown>;
    expect(pose.posture).toBe("crouching");
    expect(parseClientMessage(JSON.stringify(packet))).toEqual(packet);
    expect(
      parseClientMessage(
        JSON.stringify({
          type: "pose",
          pose: { ...pose, posture: "hovering" },
        }),
      ),
    ).toBeNull();
    disconnect();
  });
  it("keeps an explicit offline preview disconnected even with a configured live host", () => {
    const room = new MultiplayerRoom();
    const disconnect = room.connect(true);
    expect(sockets).toHaveLength(0);
    expect(room.getSnapshot().status).toBe("offline");
    expect(
      [...storageData.keys()].some((key) => key.includes("home-resume")),
    ).toBe(false);
    disconnect();
  });
  it.each([
    ["takeoff", "Jump_RunStart"],
    ["airborne", "Jump_RunAir"],
    ["landing", "Jump_RunLand"],
  ])(
    "publishes running jump %s through the existing pose contract",
    (jumpPhase, animation) => {
      const room = new MultiplayerRoom();
      const disconnect = room.connect(),
        socket = sockets[0];
      socket.open();
      snapshot(socket);
      room.publishMotion({
        ...sample,
        jumpPhase,
        animation,
        velocity: [0, 2, 6.5],
        jumpStyle: "run",
      });
      const packet = socket.sent.find((message) => message.type === "pose")!;
      expect(packet).toMatchObject({
        type: "pose",
        pose: { jumpPhase, animation, vehicle: "none", speed: 6.5 },
      });
      expect(parseClientMessage(JSON.stringify(packet))).toEqual(packet);
      expect(packet.pose).not.toHaveProperty("jumpStyle");
      disconnect();
    },
  );
  it("uses the shared world and publishes the feet pose after assigned-home acknowledgement", () => {
    const room = new MultiplayerRoom();
    expect(room.roomId).toBe(roomId);
    const disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    room.publishMotion(sample);
    expect(room.getSnapshot()).toMatchObject({
      status: "online",
      count: 2,
      selfId: "self-1",
      ids: ["friend-1"],
      fireLit: true,
    });
    expect(socket.sent.find((message) => message.type === "pose")).toEqual({
      type: "pose",
      pose: {
        position: [45, 2, 27],
        yaw: 0,
        animation: "Walk",
        activity: "none",
        vehicle: "none",
        jumpPhase: "grounded",
        speed: 3,
      },
    });
    disconnect();
  });
  it.each([true, false])(
    "publishes intermediate doorway feet and Walk/Idle for entering=%s",
    (entering) => {
      const room = new MultiplayerRoom(),
        disconnect = room.connect(),
        socket = sockets[0];
      socket.open();
      snapshot(socket);
      queueCabinTransfer(18, entering, true);
      const transfer = takeCabinTransfer()!;
      const poses: Array<{
        position: number[];
        animation: string;
        yaw: number;
        speed: number;
      }> = [];
      for (const [i, elapsed] of [0.16, 0.32, 0.48, 0.8].entries()) {
        vi.mocked(performance.now).mockReturnValue(1200 + i * 160);
        const motion = sampleCabinMotion(transfer, elapsed);
        room.publishMotion(motion);
        const packet = socket.sent.at(-1)! as {
          type: string;
          pose: (typeof poses)[number];
        };
        expect(packet.type).toBe("pose");
        expect(parseClientMessage(JSON.stringify(packet))).toMatchObject({
          type: "pose",
          pose: {
            position: packet.pose.position,
            animation: packet.pose.animation,
          },
        });
        expect(packet.pose.position).toEqual(
          motion.feet.map((v) => Math.round(v * 1000) / 1000),
        );
        expect(motion.feet[1]).toBeCloseTo(transfer.position[1] - 0.95 + 0.015);
        expect(packet.pose.yaw).toBeCloseTo(
          Math.atan2(motion.facing[0], motion.facing[2]),
          2,
        );
        poses.push(packet.pose);
      }
      expect(new Set(poses.map((p) => p.position.join(","))).size).toBe(4);
      expect(poses.slice(0, 3).map((p) => p.animation)).toEqual([
        "Walk",
        "Walk",
        "Walk",
      ]);
      expect(poses[1].speed).toBeGreaterThan(0);
      expect(poses[3]).toMatchObject({ animation: "Idle_Neutral", speed: 0 });
      disconnect();
    },
  );
  it.each(["", "?room=invalid", "?room=friends_room_with_128bits_12345"])(
    "joins the same world for URL query %s",
    (query) => {
      vi.stubGlobal("location", { href: `https://lake.example.test/${query}` });
      const first = new MultiplayerRoom(),
        second = new MultiplayerRoom();
      expect(first.roomId).toBe(CANONICAL_WORLD_ID);
      expect(second.roomId).toBe(CANONICAL_WORLD_ID);
      if (query) {
        expect(history.replaceState).toHaveBeenCalled();
        const changed = vi.mocked(history.replaceState).mock.calls[0][2] as URL;
        expect(new URL(String(changed)).searchParams.has("room")).toBe(false);
      }
    },
  );
  it("suppresses unchanged poses and updates remote targets without React subscriber notifications", () => {
    const room = new MultiplayerRoom(),
      disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    room.publishMotion(sample);
    const sent = socket.sent.length;
    vi.mocked(performance.now).mockReturnValue(2000);
    room.publishMotion(sample);
    expect(socket.sent).toHaveLength(sent);
    const listener = vi.fn(),
      unsubscribe = room.subscribe(listener);
    socket.receive({
      type: "pose",
      player: { ...friend, position: [60, 2, 20], animation: "Run" },
    });
    expect(listener).not.toHaveBeenCalled();
    expect(room.remotes.get(friend.id)?.player.position).toEqual([60, 2, 20]);
    unsubscribe();
    disconnect();
  });
  it("clears stale players and pending seat locks on disconnect, then accepts a fresh identity", async () => {
    const room = new MultiplayerRoom(),
      disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    const claimed = room.claimSeat("campfire:seat:0");
    socket.close();
    await expect(claimed).resolves.toBe(false);
    expect(room.getSnapshot()).toMatchObject({
      status: "reconnecting",
      count: 0,
      ids: [],
    });
    expect(room.remotes.size).toBe(0);
    socket.open();
    snapshot(socket, "self-2");
    expect(room.getSnapshot()).toMatchObject({
      status: "online",
      selfId: "self-2",
      count: 2,
    });
    disconnect();
  });
  it("rejects a conflicting seat without freezing presence and treats room-full as terminal", async () => {
    const room = new MultiplayerRoom(),
      disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    const claim = room.claimSeat("campfire:seat:0");
    const request = socket.sent.at(-1)!;
    socket.receive({
      type: "seat-result",
      requestId: request.requestId,
      accepted: false,
      seatId: null,
    });
    await expect(claim).resolves.toBe(false);
    socket.receive({
      type: "error",
      code: "storage-unavailable",
      message: "Try again.",
    });
    expect(room.getSnapshot().status).toBe("online");
    socket.receive({
      type: "error",
      code: "room-full",
      message: "Room is full.",
    });
    expect(room.getSnapshot().status).toBe("full");
    disconnect();
  });
  it("cancels an unanswered claim timer before a later seat is accepted", async () => {
    vi.useFakeTimers();
    const room = new MultiplayerRoom(),
      disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    const abandoned = room.claimSeat("campfire:seat:0");
    // A rate-limit error does not produce seat-result. Escape releases its request lifetime.
    socket.receive({
      type: "error",
      code: "rate-limit",
      message: "Try again.",
    });
    room.releaseSeat();
    await expect(abandoned).resolves.toBe(false);
    const accepted = room.claimSeat("campfire:seat:1");
    const request = socket.sent.at(-1)!;
    socket.receive({
      type: "seat-result",
      requestId: request.requestId,
      accepted: true,
      seatId: "campfire:seat:1",
    });
    await expect(accepted).resolves.toBe(true);
    const sentCount = socket.sent.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(socket.sent).toHaveLength(sentCount);
    expect(
      socket.sent.filter(
        (message) => message.type === "seat" && message.seatId === null,
      ),
    ).toHaveLength(1);
    disconnect();
  });

  it("opts into a private durable home, keeps credentials out of URL/diagnostics, and preserves the shared owner through old room links", () => {
    const room = new MultiplayerRoom(),
      disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    const hello = socket.sent[0];
    expect(hello).toMatchObject({
      type: "hello",
      requestHome: true,
      createHome: true,
    });
    expect(hello.resumeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storageData.get(`la-baraj-home-resume-v2:${roomId}`)).toContain(
      String(hello.resumeToken),
    );
    expect(socket.options).not.toHaveProperty("query");
    expect(location.href).not.toContain(String(hello.resumeToken));
    room.publishMotion(sample);
    socket.receive({
      type: "snapshot",
      version: 1,
      selfId: "self-1",
      players: [self],
      fire: { lit: true, revision: 0 },
      seats: {},
    });
    expect(room.getSnapshot()).toMatchObject({
      status: "connecting",
      homeIndex: null,
    });
    expect(socket.sent.some((message) => message.type === "pose")).toBe(false);
    snapshot(socket, "self-1", 2);
    expect(room.getSnapshot()).toMatchObject({
      status: "online",
      homeIndex: 2,
    });
    // The obsolete preview pose is dropped instead of briefly publishing the wrong cabin.
    expect(socket.sent.some((message) => message.type === "pose")).toBe(false);
    const write = vi.fn();
    room.attachDiagnostics({
      setAttribute: write,
    } as unknown as HTMLOutputElement);
    const diagnostics = String(write.mock.calls.at(-1)?.[1]);
    expect(diagnostics).toContain('"homeIndex":2');
    expect(diagnostics).not.toContain(String(hello.resumeToken));
    expect(diagnostics).not.toContain("resumeToken");
    disconnect();
    vi.stubGlobal("location", {
      href: "https://lake.example.test/?room=second_room_with_128bits_12345",
    });
    const other = new MultiplayerRoom(),
      stopOther = other.connect();
    sockets[1].open();
    expect(sockets[1].sent[0].resumeToken).toBe(hello.resumeToken);
    stopOther();
  });

  it("restores the same owner after refresh and replays movement only after reconnect acknowledgement", () => {
    const room = new MultiplayerRoom(),
      disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket, "self-1", 7);
    const token = socket.sent[0].resumeToken;
    room.publishMotion({ ...sample, homeIndex: 7, feet: [94, 3, 40] });
    socket.close();
    socket.open();
    expect(
      [...socket.sent].reverse().find((message) => message.type === "hello"),
    ).toMatchObject({ resumeToken: token, requestHome: true });
    expect(
      [...socket.sent].reverse().find((message) => message.type === "hello"),
    ).not.toHaveProperty("createHome");
    const poses = socket.sent.filter(
      (message) => message.type === "pose",
    ).length;
    socket.receive({
      type: "snapshot",
      version: 1,
      selfId: "self-2",
      players: [self],
      fire: { lit: true, revision: 0 },
      seats: {},
    });
    expect(room.getSnapshot()).toMatchObject({
      homeIndex: 7,
      status: "reconnecting",
    });
    expect(
      socket.sent.filter((message) => message.type === "pose"),
    ).toHaveLength(poses);
    snapshot(socket, "self-2", 7);
    expect(socket.sent.at(-1)).toMatchObject({
      type: "pose",
      pose: { position: [94, 3, 40] },
    });
    expect(room.getSnapshot().homeIndex).toBe(7);
    disconnect();
    const refreshed = new MultiplayerRoom(),
      stop = refreshed.connect(),
      nextSocket = sockets[1];
    nextSocket.open();
    snapshot(nextSocket, "refreshed-self", 7);
    expect(nextSocket.sent[0]).toMatchObject({
      resumeToken: token,
      requestHome: true,
    });
    expect(nextSocket.sent[0]).not.toHaveProperty("createHome");
    expect(refreshed.getSnapshot().homeIndex).toBe(7);
    stop();
  });

  it("retries the same pending anonymous owner after a lost first acknowledgement", () => {
    const first = new MultiplayerRoom(),
      stopFirst = first.connect(),
      a = sockets[0];
    a.open();
    const token = a.sent[0].resumeToken;
    stopFirst();
    const retry = new MultiplayerRoom(),
      stopRetry = retry.connect(),
      b = sockets[1];
    b.open();
    expect(b.sent[0]).toMatchObject({ resumeToken: token, createHome: true });
    snapshot(b, "retry-self", 9);
    expect(
      JSON.parse(storageData.get(`la-baraj-home-resume-v2:${roomId}`)!),
    ).toEqual({ resumeToken: token, createHome: false });
    stopRetry();
  });

  it("uses distinct public assignments and rejects invalid resume without replacing the credential", () => {
    const first = new MultiplayerRoom(),
      stopFirst = first.connect(),
      a = sockets[0];
    a.open();
    snapshot(a, "one", 3);
    const otherBrowserData = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => otherBrowserData.get(key) ?? null,
      setItem: (key: string, value: string) => {
        otherBrowserData.set(key, value);
      },
    });
    const second = new MultiplayerRoom(),
      stopSecond = second.connect(),
      b = sockets[1];
    b.open();
    snapshot(b, "two", 24);
    expect(first.getSnapshot().homeIndex).toBe(3);
    expect(second.getSnapshot().homeIndex).toBe(24);
    expect(b.sent[0].resumeToken).not.toBe(a.sent[0].resumeToken);
    const saved = otherBrowserData.get(`la-baraj-home-resume-v2:${roomId}`);
    b.receive({
      type: "error",
      code: "invalid-resume",
      message: "This home could not be resumed.",
    });
    expect(second.getSnapshot().status).toBe("error");
    expect(b.readyState).toBe(3);
    expect(otherBrowserData.get(`la-baraj-home-resume-v2:${roomId}`)).toBe(
      saved,
    );
    stopFirst();
    stopSecond();
  });
});

describe("player village roster", () => {
  it("uses a new housing capability after the reset and includes the current generation", () => {
    storageData.set(
      `la-baraj-home-resume-v1:${roomId}`,
      JSON.stringify({ resumeToken: "a".repeat(43), createHome: false }),
    );
    const room = new MultiplayerRoom("Claudiu"),
      disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    expect(socket.sent[0]).toMatchObject({
      type: "hello",
      nickname: "Claudiu",
      housingEpoch: 2,
      createHome: true,
    });
    expect(socket.sent[0].resumeToken).not.toBe("a".repeat(43));
    disconnect();
  });
  it("publishes the authoritative persistent cabin roster independently of player presence", () => {
    const room = new MultiplayerRoom("Claudiu"),
      disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket, "self-1", 0);
    const cabins = [
      { index: 0, ownerName: "Claudiu" },
      { index: 1, ownerName: null },
    ];
    socket.receive({ type: "village", village: { epoch: 2, cabins } });
    expect(room.getSnapshot().cabins).toEqual(cabins);
    socket.receive({ type: "left", id: "friend-1" });
    expect(room.getSnapshot().cabins).toEqual(cabins);
    disconnect();
  });
  it("allows a failed name save to recover by reloading with the same owner and chosen name", () => {
    const room = new MultiplayerRoom("Claudiu"),
      disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket, "self-1", 0);
    room.rename("Ștefan");
    socket.receive({
      type: "error",
      code: "name-save-failed",
      message: "Reconnect to save your name.",
    });
    expect(room.getSnapshot()).toMatchObject({
      status: "error",
      errorCode: "name-save-failed",
    });
    expect(socket.readyState).toBe(3);
    disconnect();
    const retry = new MultiplayerRoom(),
      stop = retry.connect(),
      next = sockets[1];
    next.open();
    expect(next.sent[0]).toMatchObject({ nickname: "Ștefan" });
    expect(next.sent[0]).not.toHaveProperty("createHome");
    expect(next.sent[0].resumeToken).toBe(socket.sent[0].resumeToken);
    stop();
  });
});

describe("private paper-game client", () => {
  it("sends only an action and revision, resolves server acknowledgement, and clears pending moves on disconnect", async () => {
    const room = new MultiplayerRoom();
    const disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    const pending = room.planesAction({ kind: "shot", x: 3, y: 4 }, 7);
    const packet = socket.sent.at(-1)!;
    expect(packet).toMatchObject({
      type: "planes-action",
      revision: 7,
      action: { kind: "shot", x: 3, y: 4 },
    });
    expect(packet).not.toHaveProperty("owner");
    const view = {
      version: 1,
      revision: 8,
      round: 1,
      phase: "playing",
      players: [null, null],
      you: null,
      ownPlanes: null,
      shots: [[], []],
      turn: 1,
      winner: null,
      deadline: 61000,
      reason: null,
      event: null,
    };
    socket.receive({ type: "planes", view, requestId: packet.requestId });
    await expect(pending).resolves.toBeNull();
    expect(room.getSnapshot().planes).toEqual(view);
    const next = room.planesAction({ kind: "shot", x: 4, y: 4 }, 8);
    disconnect();
    await expect(next).resolves.toContain("interrupted");
  });
  it("can receive an in-memory test home without persisting a fake capability", () => {
    class MemoryRoom extends MultiplayerRoom {
      accept(message: unknown) {
        this.receive(message as Parameters<typeof this.receive>[0]);
      }
    }
    const room = new MemoryRoom("Test", false),
      stop = room.connect(true);
    room.accept({
      type: "snapshot",
      version: 1,
      selfId: "test",
      players: [],
      fire: { lit: true, revision: 0 },
      seats: {},
      home: { index: 0, resumeToken: "l".repeat(43), epoch: 2 },
    });
    expect(room.getSnapshot().homeIndex).toBe(0);
    expect(sockets).toHaveLength(0);
    expect(
      [...storageData.keys()].some((key) => key.includes("home-resume")),
    ).toBe(false);
    stop();
  });
});

describe("remote activity", () => {
  it("keeps activity through pose updates, restores snapshot age and clears on input", () => {
    const room = new MultiplayerRoom();
    const disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    socket.receive({ type: "activity", id: friend.id, idleMs: 500 });
    expect(room.remotes.get(friend.id)?.lastInputAt).toBe(500);
    socket.receive({
      type: "pose",
      player: { ...friend, position: [46, 2, 27] },
    });
    expect(room.remotes.get(friend.id)?.lastInputAt).toBe(500);
    socket.receive({ type: "activity", id: friend.id, idleMs: 0 });
    expect(room.remotes.get(friend.id)?.lastInputAt).toBe(1000);
    const hello = socket.sent.find((message) => message.type === "hello")!;
    socket.receive({
      type: "snapshot",
      version: 1,
      selfId: self.id,
      players: [self, { ...friend, idleMs: 180000 }],
      fire: { lit: true, revision: 0 },
      seats: {},
      home: { index: 14, resumeToken: hello.resumeToken },
    });
    expect(room.remotes.get(friend.id)?.lastInputAt).toBe(-179000);
    disconnect();
  });
});

describe("shared weather", () => {
  it("accepts the weather snapshot and updates, but ignores malformed conditions", () => {
    const room = new MultiplayerRoom();
    const disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    expect(socket.sent).toContainEqual({ type: "weather-refresh" });
    snapshot(socket);
    const now = Date.now();
    const weather = {
      cloudCover: 76,
      weatherCode: 3,
      observedAt: now,
      fetchedAt: now,
    };
    socket.receive({ type: "weather", weather });
    expect(room.getSnapshot().weather).toEqual(weather);
    socket.receive({
      type: "weather",
      weather: { ...weather, cloudCover: 500 },
    });
    expect(room.getSnapshot().weather).toEqual(weather);
    socket.receive({ type: "weather", weather: null });
    expect(room.getSnapshot().weather).toBeNull();
    disconnect();
  });
});

describe("weather freshness", () => {
  it("expires a last-known forecast even when the connection is unavailable", () => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
      ],
    });
    const room = new MultiplayerRoom(),
      disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    const now = Date.now();
    socket.receive({
      type: "weather",
      weather: {
        cloudCover: 60,
        weatherCode: 2,
        observedAt: now,
        fetchedAt: now,
      },
    });
    expect(room.getSnapshot().weather?.cloudCover).toBe(60);
    vi.advanceTimersByTime(3 * 60 * 60 * 1000);
    expect(room.getSnapshot().weather).toBeNull();
    disconnect();
  });
});

describe("temporary chat bubbles", () => {
  it("displays live text, expires it and clears it when the player leaves", () => {
    const room = new MultiplayerRoom(),
      disconnect = room.connect(),
      socket = sockets[0];
    socket.open();
    snapshot(socket);
    socket.receive({ type: "bubble-chat", id: friend.id, text: "hi 👋" });
    expect(room.chatFor(friend.id)).toBe("hi 👋");
    vi.mocked(performance.now).mockReturnValue(6001);
    expect(room.chatFor(friend.id)).toBe("");
    socket.receive({ type: "bubble-chat", id: friend.id, text: "again" });
    socket.receive({ type: "left", id: friend.id });
    expect(room.chatFor(friend.id)).toBe("");
    room.publishChat("one\ntwo\nthree");
    expect(socket.sent.at(-1)).toEqual({
      type: "bubble-chat",
      text: "two\nthree",
    });
    disconnect();
  });
});

it("renews a remote bubble's lifetime when the same text is published again", () => {
  const room = new MultiplayerRoom(),
    disconnect = room.connect(),
    socket = sockets[0];
  socket.open();
  snapshot(socket);
  socket.receive({ type: "bubble-chat", id: friend.id, text: "See you there" });
  vi.mocked(performance.now).mockReturnValue(4000);
  socket.receive({ type: "bubble-chat", id: friend.id, text: "See you there" });
  vi.mocked(performance.now).mockReturnValue(7000);
  expect(room.chatFor(friend.id)).toBe("See you there");
  vi.mocked(performance.now).mockReturnValue(9001);
  expect(room.chatFor(friend.id)).toBe("");
  disconnect();
});
