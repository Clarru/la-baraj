import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RoomCore,
  type RoomConnection,
  type SessionState,
} from "../apps/server/room-core";
import { HomeAssignments } from "../apps/server/home-assignments";
import { HOUSING_EPOCH, type ServerMessage } from "../packages/shared/protocol";

/** Real parser/room/allocator; bounded fake sockets + in-memory durable storage. */
class LoadConnection implements RoomConnection {
  state: SessionState | null = null;
  closed = false;
  sent = 0;
  bytes = 0;
  last: ServerMessage | null = null;
  capture = false;
  setState(state: SessionState) {
    this.state = structuredClone(state);
  }
  send(raw: string) {
    this.sent++;
    this.bytes += Buffer.byteLength(raw);
    if (this.capture) this.last = JSON.parse(raw);
  }
  close() {
    this.closed = true;
  }
}
function fixture() {
  const connections: LoadConnection[] = [];
  let writes = 0;
  const homes = new HomeAssignments({
    save: async (ledger) => {
      structuredClone(ledger);
      writes++;
    },
  });
  const room = new RoomCore({
    connections: () => connections.filter((c) => !c.closed),
    homes,
    saveFire: async () => {
      writes++;
    },
  });
  const connect = (id: string, now = 0) => {
    const c = new LoadConnection();
    connections.push(c);
    room.connect(c, id, now);
    return c;
  };
  const send = (c: LoadConnection, message: unknown, now: number) =>
    room.message(c, JSON.stringify(message), now);
  const hello = (i: number) => ({
    type: "hello",
    nickname: `Friend ${i + 1}`,
    housingEpoch: HOUSING_EPOCH,
    requestHome: true,
    createHome: true,
    resumeToken: i.toString(16).padStart(43, "a"),
  });
  return {
    connections,
    homes,
    room,
    connect,
    send,
    hello,
    writes: () => writes,
  };
}

describe("full world under sustained load (no deployed-world mutations)", () => {
  it.each([30, 50])(
    "handles %i concurrent owners, ten simulated minutes of 8Hz poses, reconnects and contested seats",
    async (count) => {
      const f = fixture();
      const clients = Array.from({ length: count }, (_, i) =>
        f.connect(`load-${i}`),
      );
      await Promise.all(clients.map((c, i) => f.send(c, f.hello(i), 0)));
      expect(new Set(clients.map((c) => c.state?.home?.index)).size).toBe(
        count,
      );
      expect(f.homes.publicCabins()).toHaveLength(count);
      const afterJoinWrites = f.writes();
      for (const c of clients) {
        c.sent = 0;
        c.bytes = 0;
      }
      const samples: number[] = [];
      const began = performance.now();
      for (let tick = 1; tick <= 4800; tick++) {
        for (let i = 0; i < count; i++) {
          const beganPose = performance.now();
          await f.send(
            clients[i],
            {
              type: "pose",
              pose: {
                position: [i + tick * 0.001, 2, 10],
                yaw: 0.5,
                animation: tick % 8 === 0 ? "Jump_RunAir" : "Walk",
                activity: "none",
                vehicle: i % 3 === 0 ? "scooter" : "none",
                speed: 3,
                jumpPhase: tick % 8 === 0 ? "airborne" : "grounded",
              },
            },
            tick * 125,
          );
          samples.push(performance.now() - beganPose);
        }
      }
      const durationMs = performance.now() - began;
      const delivered = clients.reduce((sum, c) => sum + c.sent, 0);
      expect(delivered).toBe(4800 * count * (count - 1));
      expect(clients.every((c) => !c.closed && c.state!.violations === 0)).toBe(
        true,
      );
      expect(f.writes()).toBe(afterJoinWrites); // Motion must never write durable world storage.
      const bytes = clients.reduce((sum, c) => sum + c.bytes, 0);
      samples.sort((a, b) => a - b);
      const report = {
        players: count,
        simulatedSeconds: 600,
        poseHz: 8,
        inboundPoses: samples.length,
        delivered,
        bytes,
        perClientKiBps: bytes / count / 600 / 1024,
        durationMs,
        meanHandlerMs: durationMs / samples.length,
        p95HandlerMs: samples[Math.floor(samples.length * 0.95)],
        poseStorageWrites: 0,
      };
      console.log("ROOM_LOAD_RESULT", JSON.stringify(report));
      if (process.env.PERF_REPORT_DIR)
        writeFileSync(
          `${process.env.PERF_REPORT_DIR}/room-${count}.json`,
          JSON.stringify(report, null, 2),
        );

      const now = 601000;
      await Promise.all(
        clients.map((c, i) =>
          f.send(
            c,
            {
              type: "seat",
              seatId: "campfire-0:seat:0",
              requestId: `load-seat-${i}`,
            },
            now,
          ),
        ),
      );
      expect(clients.filter((c) => c.state?.player.seatId)).toHaveLength(1);
      const rejected = f.connect("one-too-many", now);
      if (count === 50) expect(rejected.closed).toBe(true);
      else rejected.closed = true;
      for (const c of clients) {
        c.closed = true;
        f.room.disconnect(c);
      }
      const returning = Array.from({ length: count }, (_, i) =>
        f.connect(`return-${i}`, now + 1000),
      );
      await Promise.all(
        returning.map((c, i) =>
          f.send(c, { ...f.hello(i), createHome: undefined }, now + 1000),
        ),
      );
      expect(returning.map((c) => c.state?.home?.index)).toEqual(
        clients.map((c) => c.state?.home?.index),
      );
      expect(f.homes.publicCabins()).toHaveLength(count);
      expect(returning.every((c) => !c.state?.player.seatId)).toBe(true);
    },
    30000,
  );

  it("bounds flood traffic without disconnecting healthy peers or leaking seat claims", async () => {
    const f = fixture(),
      bad = f.connect("flood"),
      good = f.connect("healthy");
    await Promise.all([
      f.send(bad, f.hello(0), 0),
      f.send(good, f.hello(1), 0),
    ]);
    await f.send(
      bad,
      { type: "seat", seatId: "campfire-0:seat:0", requestId: "seat" },
      500,
    );
    for (let i = 0; i < 1000 && !bad.closed; i++)
      await f.room.message(bad, "invalid packet", 500);
    expect(bad.closed).toBe(true);
    f.room.disconnect(bad);
    await f.send(
      good,
      { type: "seat", seatId: "campfire-0:seat:0", requestId: "claim" },
      1000,
    );
    expect(good.state?.player.seatId).toBe("campfire-0:seat:0");
    expect(good.closed).toBe(false);
  });
});
