import { describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { applyBoatBodyImpact } from "../apps/web/src/boat-collision";
import {
  advanceBoat,
  boatVelocity,
  createBoatMotionState,
  setBoatVelocity,
} from "../apps/web/src/boat-motion";
import {
  RoomCore,
  type RoomConnection,
  type SessionState,
} from "../apps/server/room-core";
import { HomeAssignments } from "../apps/server/home-assignments";
import {
  parseClientMessage,
  type PlayerPose,
  type ServerMessage,
} from "../packages/shared/protocol";

class Client implements RoomConnection {
  state: SessionState | null = null;
  messages: ServerMessage[] = [];
  closed = false;
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
async function fixture() {
  const clients = [new Client(), new Client(), new Client()];
  const room = new RoomCore({
    connections: () => clients.filter((c) => !c.closed),
    homes: new HomeAssignments({ save: async () => {} }),
    saveFire: async () => {},
  });
  const send = (c: Client, pose: PlayerPose, now: number) =>
    room.message(c, JSON.stringify({ type: "pose", pose }), now);
  for (const [i, c] of clients.entries()) {
    room.connect(c, String(i), 0);
    await room.message(
      c,
      JSON.stringify({ type: "hello", nickname: `Player ${i}` }),
      0,
    );
  }
  const impacts = (c: Client) =>
    c.messages.filter(
      (m): m is Extract<ServerMessage, { type: "boat-impact" }> =>
        m.type === "boat-impact",
    );
  return {
    room,
    send,
    impacts,
    a: clients[0],
    b: clients[1],
    observer: clients[2],
  };
}
const pose = (z: number, vz = 0, yaw = 0, revision = 0): PlayerPose => ({
  position: [0, 0.05, z],
  yaw,
  animation: "Activity_Sit",
  activity: "none",
  vehicle: "boat",
  posture: "standing",
  speed: vz,
  boat: {
    position: [0, z],
    velocity: [0, vz],
    yaw,
    angularVelocity: 0,
    rudder: 0,
  },
  boatImpactRevision: revision,
});
describe("shared boat authority", () => {
  it("uses physical yaw rather than a smoothed visual facing and preserves rotational state", async () => {
    const f = await fixture(),
      packet = pose(0, 0);
    packet.yaw = 0.4;
    packet.boat!.yaw = 0.2;
    packet.boat!.angularVelocity = 0.3;
    packet.boat!.rudder = 0.5;
    await f.send(f.a, packet, 0);
    expect(f.a.state!.player.yaw).toBeCloseTo(0.2);
    expect(f.a.state!.player.boat).toMatchObject({
      angularVelocity: 0.3,
      rudder: 0.5,
    });
  });
  it("sends contact-point yaw to modern drivers while keeping an older driver rotation locked", async () => {
    const f = await fixture();
    const first = pose(0, 8);
    first.position[0] = 0.7;
    first.boat!.position[0] = 0.7;
    await f.send(f.a, first, 0);
    await f.send(f.b, pose(7), 0);
    const next = {
      ...first,
      position: [0.7, 0.05, 1.6] as [number, number, number],
      boat: { ...first.boat!, position: [0.7, 1.6] as [number, number] },
    };
    await f.send(f.a, next, 200);
    expect(
      Math.abs(f.impacts(f.b).at(-1)!.boat.angularVelocity!),
    ).toBeGreaterThan(0.05);
    const legacy = await fixture();
    const old = pose(7);
    delete old.boat!.angularVelocity;
    delete old.boat!.rudder;
    await legacy.send(legacy.a, first, 0);
    await legacy.send(legacy.b, old, 0);
    await legacy.send(legacy.a, next, 200);
    expect(
      legacy.impacts(legacy.b).at(-1)!.boat.angularVelocity,
    ).toBeUndefined();
    expect(legacy.b.closed).toBe(false);
  });
  it("propagates a collision into a third occupied boat with one final correction per owner", async () => {
    const f = await fixture();
    await f.send(f.a, pose(0, 8), 0);
    await f.send(f.b, pose(6.4), 0);
    await f.send(f.observer, pose(12.8), 0);
    await f.send(f.a, pose(1.6, 8), 200);
    for (const c of [f.a, f.b, f.observer])
      expect(f.impacts(c)).toHaveLength(1);
    expect(f.impacts(f.observer)[0].boat.velocity[1]).toBeGreaterThan(1);
  });
  it("uses the physical boat position instead of lagged visual feet for collision state", async () => {
    const f = await fixture();
    const packet = pose(1.6, 8);
    packet.position = [0, 0.05, 1.4];
    await f.send(f.a, packet, 0);
    expect(f.a.state!.player.position).toEqual([0, 0.05, 1.6]);
    expect(f.a.state!.player.boat!.position).toEqual([0, 1.6]);
  });
  it.each([
    { label: "legacy rear push", offset: 0, modern: false },
    { label: "modern off-centre push", offset: 0.7, modern: true },
  ])(
    "runs $label through real physics bodies without launch, dismount or persistent braking",
    async ({ offset, modern }) => {
      await RAPIER.init();
      const f = await fixture();
      const runners = [f.a, f.b].map((client, i) => {
        const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic().setTranslation(
            i === 0 ? offset : 0,
            0.8,
            i * 10,
          ),
        );
        world.createCollider(RAPIER.ColliderDesc.capsule(0.35, 0.3), body);
        const motion = createBoatMotionState(0);
        motion.speed = i === 0 ? 8 : 0;
        body.setLinvel({ x: 0, y: 0, z: motion.speed }, true);
        return { client, world, body, motion, revision: 0 };
      });
      try {
        const publish = async (r: (typeof runners)[number], now: number) => {
          const p = r.body.translation(),
            v = r.body.linvel();
          await f.send(
            r.client,
            {
              ...pose(p.z, v.z, 0, r.revision),
              boat: {
                position: [p.x, p.z],
                yaw: r.motion.yaw,
                velocity: [v.x, v.z],
                ...(modern
                  ? {
                      angularVelocity: r.motion.turnRate,
                      rudder: r.motion.steer,
                    }
                  : {}),
              },
            },
            now,
          );
        };
        for (const r of runners) await publish(r, 0);
        for (let frame = 1; frame <= 480; frame++) {
          for (const [i, r] of runners.entries()) {
            const achieved = r.body.linvel();
            setBoatVelocity(r.motion, [achieved.x, achieved.z]);
            advanceBoat(r.motion, {
              throttle: i === 0 && (modern || frame < 120) ? 1 : 0,
              steer: 0,
              dt: 1 / 60,
            });
            r.body.setLinvel(
              boatVelocity({
                yaw: r.motion.yaw,
                speed: r.motion.speed,
                driftX: r.motion.driftX,
                driftZ: r.motion.driftZ,
                velocityY: r.body.linvel().y,
                bodyY: r.body.translation().y,
                time: frame / 60,
                dt: 1 / 60,
              }),
              true,
            );
            r.world.step();
            expect(Math.abs(r.body.translation().y - 0.8)).toBeLessThan(0.08);
            expect(
              Math.hypot(r.body.linvel().x, r.body.linvel().z),
            ).toBeLessThanOrEqual(12.8 + 0.001);
          }
          if (frame % 9 === 0)
            for (const r of runners) await publish(r, (frame * 1000) / 60);
          for (const r of runners) {
            const impact = f.impacts(r.client).at(-1);
            if (impact && impact.revision > r.revision) {
              applyBoatBodyImpact(
                r.world,
                RAPIER,
                r.body,
                r.motion,
                impact.boat,
              );
              r.revision = impact.revision;
            }
          }
        }
        expect(runners[1].body.translation().z).toBeGreaterThan(20);
        if (modern) {
          expect(runners[0].motion.speed).toBeGreaterThan(3);
          expect(Math.abs(runners[1].motion.yaw)).toBeGreaterThan(0.05);
        }
        for (const r of runners) {
          expect(r.revision).toBeGreaterThan(0);
          expect(r.client.closed).toBe(false);
          expect(r.client.state!.player.vehicle).toBe("boat");
        }
      } finally {
        for (const r of runners) r.world.free();
      }
    },
  );
  it("sends equal, damped head-on results to drivers and observer without changing height", async () => {
    const f = await fixture();
    await f.send(f.a, pose(0, 8), 0);
    await f.send(f.b, pose(8, -8, Math.PI), 0);
    await f.send(f.a, pose(1.6, 8), 200);
    const a = f.impacts(f.a).at(-1)!,
      b = f.impacts(f.b).at(-1)!;
    expect(a.revision).toBe(1);
    expect(b.revision).toBe(1);
    expect(Math.abs(a.boat.velocity[1])).toBeLessThan(1);
    expect(Math.abs(b.boat.velocity[1])).toBeLessThan(1);
    expect(f.a.state!.player.position[1]).toBe(0.05);
    expect(f.b.state!.player.position[1]).toBe(0.05);
    for (const c of [f.a, f.b]) {
      expect(c.state!.player.vehicle).toBe("boat");
      expect(c.closed).toBe(false);
      expect(f.observer.messages).toContainEqual({
        type: "pose",
        player: c.state!.player,
      });
    }
    expect(a.boat).not.toHaveProperty("moored");
  });
  it("pushes a stopped occupied boat and accepts only the acknowledged result", async () => {
    const f = await fixture();
    await f.send(f.a, pose(0, 8), 0);
    await f.send(f.b, pose(7), 0);
    await f.send(f.a, pose(1.6, 8), 200);
    const impact = f.impacts(f.a).at(-1)!;
    expect(f.impacts(f.b).at(-1)!.boat.velocity[1]).toBeGreaterThan(3);
    const corrected = structuredClone(f.a.state!.player);
    await f.send(f.a, pose(2.5, 8), 300); // already queued before receipt of impact
    expect(f.a.state!.player).toEqual(corrected);
    await f.send(
      f.a,
      { ...corrected, boatImpactRevision: impact.revision },
      400,
    );
    expect(f.a.closed).toBe(false);
    expect(f.a.state!.player.boatImpactRevision).toBe(impact.revision);
  });
  it("still resolves ordinary poses delivered together in one network batch", async () => {
    const f = await fixture();
    await f.send(f.a, pose(0, 8), 0);
    await f.send(f.b, pose(7), 0);
    await f.send(f.a, pose(1.6, 8), 0);
    expect(f.impacts(f.a)).toHaveLength(1);
    expect(f.impacts(f.b)).toHaveLength(1);
  });
  it("keeps an unattended boat moored without moving its walking owner", async () => {
    const f = await fixture();
    await f.send(f.a, pose(0, 8), 0);
    const moored = {
      ...pose(7),
      vehicle: "none" as const,
      position: [55, 6, 60] as [number, number, number],
      animation: "Walk",
    };
    await f.send(f.b, moored, 0);
    await f.send(f.a, pose(1.6, 8), 200);
    expect(f.impacts(f.a)).toHaveLength(1);
    expect(f.impacts(f.b)).toHaveLength(0);
    expect(f.b.state!.player.position).toEqual([55, 6, 60]);
    expect(f.b.state!.player.boat!.position).toEqual([0, 7]);
    expect(f.b.state!.player.boat!.velocity).toEqual([0, 0]);
  });
  it("ignores first-sample teleports, distant boats and legacy clients", async () => {
    const f = await fixture();
    await f.send(f.a, pose(-100, 8), 0);
    await f.send(f.b, pose(7), 0);
    await f.send(f.a, pose(1.6, 8), 200);
    expect(f.impacts(f.b)).toHaveLength(0);
    const legacy = pose(1.7, 8);
    delete legacy.boat;
    delete legacy.boatImpactRevision;
    await f.send(f.observer, legacy, 200);
    expect(f.observer.closed).toBe(false);
    expect(f.impacts(f.observer)).toHaveLength(0);
  });
  it("rejects forged impacts, excessive velocities, invalid vectors and revisions", () => {
    expect(
      parseClientMessage(
        JSON.stringify({
          type: "boat-impact",
          revision: 1,
          boat: pose(0).boat,
        }),
      ),
    ).toBeNull();
    for (const patch of [
      { boat: { ...pose(0).boat, velocity: [0, 100] } },
      { boat: { ...pose(0).boat, position: [0] } },
      { boat: { ...pose(0).boat, yaw: Infinity } },
      { boatImpactRevision: -1 },
      { boatImpactRevision: 1.5 },
      { boat: { ...pose(0).boat, angularVelocity: 2 } },
      { boat: { ...pose(0).boat, angularVelocity: NaN } },
      { boat: { ...pose(0).boat, rudder: 1.01 } },
    ])
      expect(
        parseClientMessage(
          JSON.stringify({ type: "pose", pose: { ...pose(0), ...patch } }),
        ),
      ).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: "pose", pose: pose(0, 12.8) })),
    ).not.toBeNull();
  });
  it("removes disconnected boats from collision candidates", async () => {
    const f = await fixture();
    await f.send(f.a, pose(0, 8), 0);
    await f.send(f.b, pose(7), 0);
    f.b.closed = true;
    await f.room.disconnect(f.b);
    await f.send(f.a, pose(1.6, 8), 200);
    expect(f.impacts(f.a)).toHaveLength(0);
  });
  it("does not collide duplicate sessions belonging to the same personal boat", async () => {
    const f = await fixture();
    for (const c of [f.a, f.b])
      c.setState({
        ...c.state!,
        home: { index: 0, resumeToken: "a".repeat(43) },
      });
    await f.send(f.a, pose(0, 8), 0);
    await f.send(f.b, pose(7), 0);
    await f.send(f.a, pose(1.6, 8), 200);
    expect(f.impacts(f.a)).toHaveLength(0);
    expect(f.impacts(f.b)).toHaveLength(0);
  });
});
