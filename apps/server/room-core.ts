import {
  MAX_PLAYERS,
  AFK_AFTER_MS,
  HOUSING_EPOCH,
  PROTOCOL_VERSION,
  parseClientMessage,
  type FireState,
  type HomeAssignment,
  type PlayerPresence,
  type ServerMessage,
  type ClientMessage,
} from "../../packages/shared/protocol";
import { HomeAllocationError, type HomeAssignments } from "./home-assignments";
import { PlanesTable, TableError, type TableActor } from "./planes-table";
import {
  PLANES_TABLE,
  PLANES_SEATS,
  planesSeatSide,
  planesSeatPose,
} from "../../packages/shared/planes-station";

type Bucket = { tokens: number; at: number };
export type SessionState = {
  player: PlayerPresence;
  all: Bucket;
  pose: Bucket;
  action: Bucket;
  violations: number;
  lastInputAt?: number;
  lastActivityReportAt?: number;
  punchAt?: number;
  stunnedUntil?: number;
  punchImmuneUntil?: number;
  /** Optional for connection attachments created before home allocation shipped. */
  home?: HomeAssignment;
  nameAt?: number;
  housingEpoch?: number;
  resumeTable?: boolean;
};
export interface RoomConnection {
  readonly state: Readonly<SessionState> | null;
  setState(state: SessionState): unknown;
  send(message: string): void;
  close(code: number, reason: string): void;
}
export type RoomRuntime = {
  connections(): Iterable<RoomConnection>;
  saveFire(fire: FireState): Promise<void>;
  homes: HomeAssignments;
  planes?: PlanesTable;
  retryPlaneCleanup?: () => Promise<void>;
};
/** These buckets are stored in the websocket attachment and survive hibernation. */
export function consume(
  bucket: Bucket,
  now: number,
  rate: number,
  capacity: number,
): Bucket | null {
  const tokens = Math.min(
    capacity,
    bucket.tokens + (Math.max(0, now - bucket.at) * rate) / 1000,
  );
  return tokens >= 1 ? { tokens: tokens - 1, at: now } : null;
}

export class RoomCore {
  fire: FireState;
  private homeClaims = new WeakMap<RoomConnection, Promise<HomeAssignment>>();
  private planes: PlanesTable;
  private cleanupRetryAt = 0;
  private seatQueues = new WeakMap<RoomConnection, Promise<void>>();
  constructor(
    private runtime: RoomRuntime,
    fire: FireState = { lit: true, revision: 0 },
  ) {
    this.fire = fire;
    this.planes = runtime.planes ?? new PlanesTable({ save: async () => {} });
  }
  private tableActor(connection: RoomConnection): TableActor | null {
    const state = connection.state;
    if (!state || state.nameAt === undefined) return null;
    return {
      owner: state.home
        ? `home:${HOUSING_EPOCH}:${state.home.index}`
        : `session:${state.player.id}`,
      socket: state.player.id,
      name: state.player.nickname,
    };
  }
  private broadcastPlanes() {
    for (const c of this.active())
      this.send(c, {
        type: "planes",
        view: this.planes.view(this.tableActor(c)),
      });
  }
  private restoreGameSeat(connection: RoomConnection, side: 0 | 1) {
    if (!this.active().includes(connection)) return;
    const pose = planesSeatPose(side);
    connection.setState({
      ...connection.state!,
      resumeTable: false,
      player: {
        ...connection.state!.player,
        ...pose,
        seatId: PLANES_SEATS[side],
        activity: "sit",
        animation: "Activity_Sit",
      },
    });
    this.broadcast({ type: "seats", seats: this.seats() });
    this.broadcast(
      { type: "pose", player: connection.state!.player },
      connection,
    );
    this.snapshot(connection);
  }
  private async resumeWaitingActors(now = Date.now()) {
    let restored = false;
    for (const c of this.active()) {
      if (!c.state!.resumeTable) continue;
      const actor = this.tableActor(c);
      if (!actor) continue;
      const side = await this.planes.resume(actor, now);
      if (side !== null) {
        this.restoreGameSeat(c, side);
        restored = true;
      } else if (
        !this.planes.canResume(actor, now) &&
        !this.planes.hasOtherSocket(actor)
      )
        c.setState({ ...c.state!, resumeTable: false });
    }
    if (restored) this.broadcastPlanes();
  }
  private reconcileGameSeats() {
    let changed = false;
    for (const c of this.active()) {
      const side = planesSeatSide(c.state!.player.seatId),
        actor = this.tableActor(c);
      if (side !== null && (!actor || this.planes.sideFor(actor) !== side)) {
        const { seatId: _seat, ...player } = c.state!.player;
        c.setState({
          ...c.state!,
          player: { ...player, activity: "none", animation: "Idle_Neutral" },
        });
        changed = true;
        this.broadcast({ type: "pose", player: c.state!.player }, c);
      }
    }
    if (changed) this.broadcast({ type: "seats", seats: this.seats() });
  }
  private send(connection: RoomConnection, message: ServerMessage) {
    connection.send(JSON.stringify(message));
  }
  private active() {
    return [...this.runtime.connections()].filter((c) => c.state !== null);
  }
  private broadcast(message: ServerMessage, exclude?: RoomConnection) {
    const raw = JSON.stringify(message);
    for (const connection of this.active())
      if (connection !== exclude) connection.send(raw);
  }
  private seats(): Record<string, string> {
    return Object.fromEntries(
      this.active().flatMap((c) =>
        c.state!.player.seatId
          ? [[c.state!.player.seatId, c.state!.player.id]]
          : [],
      ),
    );
  }
  snapshot(connection: RoomConnection, now = Date.now()) {
    if (!connection.state) return;
    this.send(connection, {
      type: "snapshot",
      version: PROTOCOL_VERSION,
      selfId: connection.state.player.id,
      serverTime: now,
      village: {
        epoch: HOUSING_EPOCH,
        cabins: this.runtime.homes.publicCabins(),
      },
      players: this.active().map((c) => ({
        ...c.state!.player,
        ...(c.state!.lastInputAt === undefined
          ? {}
          : {
              idleMs: Math.min(
                AFK_AFTER_MS,
                Math.max(0, now - c.state!.lastInputAt),
              ),
            }),
      })),
      fire: this.fire,
      seats: this.seats(),
      planes: this.planes.view(this.tableActor(connection)),
      ...(connection.state.home ? { home: connection.state.home } : {}),
    });
  }
  async commitNames(now = Date.now()) {
    if (await this.runtime.homes.commitDueNames(now)) this.broadcastVillage();
    await this.planes.flush();
    await this.resumeWaitingActors(now);
    if (await this.planes.expire(now)) {
      this.reconcileGameSeats();
      this.broadcastPlanes();
    }
  }
  private broadcastVillage() {
    this.broadcast({
      type: "village",
      village: {
        epoch: HOUSING_EPOCH,
        cabins: this.runtime.homes.publicCabins(),
      },
    });
  }
  connect(connection: RoomConnection, id: string, now = Date.now()) {
    if (this.active().length >= MAX_PLAYERS) {
      this.send(connection, {
        type: "error",
        code: "room-full",
        message: "The world is busy. Please try again shortly.",
      });
      connection.close(1008, "World temporarily busy");
      return;
    }
    connection.setState({
      housingEpoch: HOUSING_EPOCH,
      player: {
        id,
        nickname: "Guest",
        position: [0, 0, 0],
        yaw: 0,
        animation: "idle",
        activity: "none",
        vehicle: "none",
      },
      all: { tokens: 30, at: now },
      pose: { tokens: 3, at: now },
      action: { tokens: 5, at: now },
      violations: 0,
    });
    this.snapshot(connection);
    this.broadcast(
      { type: "joined", player: connection.state!.player },
      connection,
    );
  }
  private invalid(connection: RoomConnection, code: string, message: string) {
    if (!connection.state) return;
    const violations = connection.state.violations + 1;
    connection.setState({ ...connection.state, violations });
    this.send(connection, { type: "error", code, message });
    if (violations >= 3)
      connection.close(1008, "Invalid or excessive messages");
  }
  async message(connection: RoomConnection, raw: unknown, now = Date.now()) {
    const state = connection.state;
    if (!state) return;
    if (state.housingEpoch !== HOUSING_EPOCH) {
      this.send(connection, {
        type: "error",
        code: "world-updated",
        message: "The village has been rebuilt. Reload to join.",
      });
      connection.close(1012, "Reload the village");
      return;
    }
    const all = consume(state.all, now, 20, 30);
    if (!all) {
      this.invalid(connection, "rate-limit", "Message limit exceeded.");
      return;
    }
    connection.setState({ ...state, all });
    const message = typeof raw === "string" ? parseClientMessage(raw) : null;
    if (!message) {
      this.invalid(
        connection,
        "invalid-packet",
        "Unsupported or invalid message.",
      );
      return;
    }
    // Recover an observed disconnect even if an outage also prevented scheduling
    // its alarm. Ordinary live traffic retries at most once per second.
    if (
      (this.planes.needsFlush ||
        this.active().some((c) => c.state!.resumeTable)) &&
      now >= this.cleanupRetryAt
    ) {
      this.cleanupRetryAt = now + 1000;
      try {
        await this.planes.flush();
        await this.resumeWaitingActors(now);
        if (await this.planes.expire(now)) this.reconcileGameSeats();
        this.broadcastPlanes();
      } catch {
        try {
          await this.runtime.retryPlaneCleanup?.();
        } catch {}
      }
    }
    const current = connection.state!;
    if (message.type === "pose") {
      const pose = consume(current.pose, now, 10, 3);
      // Dropping excess poses absorbs ordinary network batching without an error storm.
      if (!pose) return;
      const { seatId: _ignored, ...clientPose } = message.pose;
      const player = { ...current.player, ...clientPose };
      connection.setState({ ...current, pose, player });
      this.broadcast({ type: "pose", player }, connection);
      return;
    }
    if (message.type === "activity") {
      if (
        current.lastActivityReportAt !== undefined &&
        now - current.lastActivityReportAt < 1000 &&
        !(
          current.lastInputAt !== undefined &&
          now - current.lastInputAt >= AFK_AFTER_MS &&
          message.idleMs < AFK_AFTER_MS
        )
      )
        return;
      connection.setState({
        ...current,
        lastInputAt: now - message.idleMs,
        lastActivityReportAt: now,
      });
      this.broadcast(
        { type: "activity", id: current.player.id, idleMs: message.idleMs },
        connection,
      );
      return;
    }
    if (message.type === "punch") {
      const attacker = connection.state!;
      const p = attacker.player;
      const eligible = (player: PlayerPresence) =>
        player.animation !== "idle" &&
        !player.animation.startsWith("Swim_") &&
        player.activity === "none" &&
        player.vehicle === "none" &&
        !player.seatId;
      if (
        attacker.nameAt === undefined ||
        !eligible(p) ||
        (attacker.stunnedUntil ?? 0) > now ||
        (attacker.punchAt !== undefined && now - attacker.punchAt < 1200)
      )
        return;
      connection.setState({ ...attacker, punchAt: now });
      const candidates = this.active()
        .filter((c) => {
          const state = c.state!;
          if (
            c === connection ||
            state.nameAt === undefined ||
            !eligible(state.player) ||
            (state.punchImmuneUntil ?? 0) > now
          )
            return false;
          const [x, y, z] = state.player.position;
          const dx = x - p.position[0],
            dz = z - p.position[2];
          const distance = Math.hypot(dx, dz);
          return (
            distance <= 2 &&
            Math.abs(y - p.position[1]) <= 1.3 &&
            (distance < 0.15 ||
              (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / distance >= 0.45)
          );
        })
        .sort((a, b) => {
          const distance = (c: RoomConnection) =>
            Math.hypot(
              c.state!.player.position[0] - p.position[0],
              c.state!.player.position[2] - p.position[2],
            );
          return distance(a) - distance(b);
        });
      const target = candidates[0];
      if (target)
        target.setState({
          ...target.state!,
          stunnedUntil: now + 2000,
          punchImmuneUntil: now + 3000,
        });
      this.broadcast({
        type: "punch",
        attackerId: p.id,
        targetId: target?.state!.player.id ?? null,
      });
      return;
    }
    const action = consume(current.action, now, 2, 5);
    if (!action) {
      this.invalid(connection, "rate-limit", "Interaction limit exceeded.");
      return;
    }
    connection.setState({ ...current, action });
    if (message.type === "planes-action") {
      const actor = this.tableActor(connection);
      let error: string | undefined;
      try {
        if (!actor)
          throw new TableError("Choose a name and sit at the table first.");
        if (await this.planes.expire(now)) {
          this.reconcileGameSeats();
          this.broadcastPlanes();
        }
        await this.planes.act(
          actor,
          message.action,
          message.requestId,
          message.revision,
          now,
        );
        this.reconcileGameSeats();
        this.broadcastPlanes();
      } catch (e) {
        error =
          e instanceof TableError
            ? e.message
            : "The table couldn't save that move. Please try again.";
      }
      this.send(connection, {
        type: "planes",
        view: this.planes.view(actor),
        requestId: message.requestId,
        ...(error ? { error } : {}),
      });
      return;
    }
    if (message.type === "sync") {
      this.snapshot(connection);
      return;
    }
    if (message.type === "hello") {
      if (message.requestHome && message.housingEpoch !== HOUSING_EPOCH) {
        this.send(connection, {
          type: "error",
          code: "world-updated",
          message: "The village has been rebuilt. Reload to join.",
        });
        connection.close(1008, "Reload for the rebuilt village");
        return;
      }
      // Record renames in receipt order. An earlier home allocation may await
      // storage while a newer hello updates this same connection's nickname.
      connection.setState({
        ...connection.state!,
        nameAt: now,
        player: { ...connection.state!.player, nickname: message.nickname },
      });
      if (message.requestHome === true) {
        if (
          connection.state!.home &&
          connection.state!.home!.resumeToken !== message.resumeToken
        ) {
          this.send(connection, {
            type: "error",
            code: "invalid-resume",
            message: "A connected player cannot change cabin ownership.",
          });
          connection.close(1008, "Invalid home resume");
          return;
        }
        if (!connection.state!.home) {
          let pending = this.homeClaims.get(connection);
          if (!pending) {
            pending = this.runtime.homes.claim(
              message.resumeToken!,
              message.createHome === true,
              message.nickname,
              now,
            );
            this.homeClaims.set(connection, pending);
          }
          try {
            const home = await pending;
            // The browser already saved the credential before requesting. If
            // its socket closed during persistence, a retry can safely resume
            // this assignment without sending to the departed connection.
            if (!this.active().includes(connection)) return;
            // A duplicate hello may have awaited the same allocation. Always
            // preserve the newest rate/pose/seat state across this storage wait.
            if (home.resumeToken !== message.resumeToken)
              throw new HomeAllocationError(
                "invalid-resume",
                "A connected player cannot change cabin ownership.",
              );
            connection.setState({
              ...connection.state!,
              home,
              player: { ...connection.state!.player, homeIndex: home.index },
            });
          } catch (error) {
            if (error instanceof HomeAllocationError) {
              this.send(connection, {
                type: "error",
                code: error.code,
                message: error.message,
              });
              connection.close(1008, "Home allocation unavailable");
            } else
              this.send(connection, {
                type: "error",
                code: "storage-unavailable",
                message:
                  "Your cabin could not be saved. Retry with the same saved credential.",
              });
            return;
          } finally {
            this.homeClaims.delete(connection);
          }
        }
      }
      if (connection.state!.home) {
        try {
          await this.runtime.homes.stageName(
            connection.state!.home!.index,
            connection.state!.player.nickname,
            connection.state!.nameAt ?? now,
          );
        } catch {
          this.send(connection, {
            type: "error",
            code: "name-save-failed",
            message: "Your name could not be saved. Reconnect to try again.",
          });
          connection.close(1011, "Name save unavailable");
          return;
        }
        this.broadcastVillage();
      }
      const actor = this.tableActor(connection);
      if (actor) {
        if (
          this.planes.canResume(actor, now) ||
          this.planes.hasOtherSocket(actor)
        )
          connection.setState({ ...connection.state!, resumeTable: true });
        try {
          await this.planes.bindActor(actor);
          const side = await this.planes.resume(actor, now);
          if (side !== null && this.active().includes(connection)) {
            this.restoreGameSeat(connection, side);
            this.broadcast({ type: "seats", seats: this.seats() });
            this.broadcastPlanes();
          } else if (this.planes.hasOtherSocket(actor))
            connection.setState({ ...connection.state!, resumeTable: true });
        } catch {
          // Retain the waiting marker when an authenticated resume cannot save.
          try {
            await this.runtime.retryPlaneCleanup?.();
          } catch {}
        }
      }
      this.broadcast({ type: "pose", player: connection.state!.player });
      if (message.requestHome) this.snapshot(connection);
      return;
    }
    if (message.type === "fire") {
      if (this.fire.lit === message.lit) return;
      const previous = this.fire;
      this.fire = { lit: message.lit, revision: this.fire.revision + 1 };
      const next = this.fire;
      try {
        await this.runtime.saveFire(next);
      } catch {
        if (this.fire === next) this.fire = previous;
        this.send(connection, {
          type: "error",
          code: "storage-unavailable",
          message: "The fire change could not be saved. Try again.",
        });
        this.snapshot(connection);
        return;
      }
      this.broadcast({ type: "fire", fire: next });
      return;
    }
    const prior = this.seatQueues.get(connection) ?? Promise.resolve();
    const next = prior.then(() => this.changeSeat(connection, message, now));
    this.seatQueues.set(
      connection,
      next.catch(() => {}),
    );
    return next;
  }
  private async changeSeat(
    connection: RoomConnection,
    message: Extract<ClientMessage, { type: "seat" }>,
    now: number,
  ) {
    if (!this.active().includes(connection)) return;
    const cabinSeat = message.seatId?.match(/^cabin-(\d+):/);
    if (
      cabinSeat &&
      !this.runtime.homes
        .publicCabins()
        .some((c) => c.index === Number(cabinSeat[1]))
    ) {
      this.send(connection, {
        type: "seat-result",
        requestId: message.requestId,
        accepted: false,
        seatId: connection.state!.player.seatId ?? null,
        reason: "This cabin has not been built.",
      });
      return;
    }
    const occupied = message.seatId !== null && this.seats()[message.seatId];
    const player = connection.state!.player;
    if (occupied && occupied !== player.id) {
      this.send(connection, {
        type: "seat-result",
        requestId: message.requestId,
        accepted: false,
        seatId: player.seatId ?? null,
        reason: "Someone is already sitting here.",
      });
      this.send(connection, { type: "seats", seats: this.seats() });
      return;
    }
    const gameSide = planesSeatSide(message.seatId),
      actor = this.tableActor(connection);
    try {
      if (gameSide !== null) {
        if (!actor)
          throw new TableError("Choose a name before joining the table.");
        if (await this.planes.expire(now)) {
          this.reconcileGameSeats();
          this.broadcastPlanes();
        }
        const p = connection.state!.player.position;
        if (
          !this.planes.canResume(actor, now) &&
          Math.hypot(p[0] - PLANES_TABLE.x, p[2] - PLANES_TABLE.z) > 8
        )
          throw new TableError("Walk up to the Planes table first.");
        await this.planes.join(actor, gameSide, now);
        if (!this.active().includes(connection)) {
          await this.planes.disconnect(actor, now);
          return;
        }
      } else if (actor && this.planes.hasSocket(actor.socket))
        await this.planes.leave(actor, now);
    } catch (e) {
      this.send(connection, {
        type: "seat-result",
        requestId: message.requestId,
        accepted: false,
        seatId: connection.state!.player.seatId ?? null,
        reason:
          e instanceof TableError
            ? e.message
            : "The table couldn't save your seat. Try again.",
      });
      return;
    }
    const { seatId: _oldSeat, ...standing } = connection.state!.player;
    const nextPlayer =
      message.seatId === null
        ? standing
        : { ...standing, seatId: message.seatId };
    connection.setState({ ...connection.state!, player: nextPlayer });
    this.send(connection, {
      type: "seat-result",
      requestId: message.requestId,
      accepted: true,
      seatId: message.seatId,
    });
    this.broadcast({ type: "seats", seats: this.seats() });
    this.broadcast({ type: "pose", player: nextPlayer }, connection);
    if (gameSide !== null || planesSeatSide(player.seatId) !== null)
      this.broadcastPlanes();
  }
  disconnect(connection: RoomConnection) {
    if (!connection.state) return;
    this.broadcast(
      { type: "left", id: connection.state.player.id },
      connection,
    );
    // The PartyServer iterator no longer contains the closed connection.
    this.broadcast({ type: "seats", seats: this.seats() }, connection);
    const actor = this.tableActor(connection);
    if (actor && this.planes.hasSocket(actor.socket))
      return this.planes
        .disconnect(actor)
        .catch(async () => {
          try {
            await this.runtime.retryPlaneCleanup?.();
          } catch {
            /* A later message/wake retries after a storage outage. */
          }
        })
        .then(async () => {
          this.broadcastPlanes();
          try {
            await this.resumeWaitingActors();
            this.broadcastPlanes();
          } catch {
            try {
              await this.runtime.retryPlaneCleanup?.();
            } catch {}
          }
        });
  }
}
