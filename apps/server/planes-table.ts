import {
  legalFleet,
  randomFleet,
  resolveShot,
  targetUnavailable,
  destroyed,
  otherSide,
  isGridPoint,
  isPlane,
  type Plane,
  type Side,
  type Shot,
  type PlanesAction,
  type PlanesEvent,
  type PlanesView,
} from "../../packages/shared/planes";
import { PLANES_RECONNECT_MS } from "../../packages/shared/planes-station";

export type TableActor = { owner: string; socket: string; name: string };
type Member = TableActor & {
  planes: Plane[];
  ready: boolean;
  awayUntil: number | null;
  requests: string[];
};
export type PlanesRecord = {
  version: 1;
  revision: number;
  round: number;
  phase: PlanesView["phase"];
  members: [Member | null, Member | null];
  shots: [Shot[], Shot[]];
  turn: Side | null;
  winner: Side | null;
  reason: PlanesView["reason"];
  event: PlanesEvent | null;
  deadline: number | null;
  /** Frozen before rematch readiness can replace a member's private fleet. */
  completedPlanes?: [Plane[] | null, Plane[] | null];
};
const emptyRecord = (): PlanesRecord => ({
  version: 1,
  revision: 0,
  round: 0,
  phase: "lobby",
  members: [null, null],
  shots: [[], []],
  turn: null,
  winner: null,
  reason: null,
  event: null,
  deadline: null,
});
const validName = (n: unknown) =>
  typeof n === "string" &&
  n.length > 0 &&
  n.length <= 24 &&
  !/[\p{C}<>]/u.test(n);
export function readPlanesRecord(value: unknown): PlanesRecord {
  if (value === undefined) return emptyRecord();
  const r = value as PlanesRecord;
  if (
    !r ||
    r.version !== 1 ||
    !Number.isSafeInteger(r.revision) ||
    r.revision < 0 ||
    !Number.isSafeInteger(r.round) ||
    r.round < 0 ||
    !["lobby", "setup", "playing", "finished"].includes(r.phase) ||
    !Array.isArray(r.members) ||
    r.members.length !== 2 ||
    !r.members.every(
      (m) =>
        m === null ||
        (m &&
          typeof m.owner === "string" &&
          m.owner.length <= 100 &&
          typeof m.socket === "string" &&
          m.socket.length <= 100 &&
          validName(m.name) &&
          legalFleet(m.planes) &&
          typeof m.ready === "boolean" &&
          (m.awayUntil === null ||
            (Number.isFinite(m.awayUntil) && m.awayUntil >= 0)) &&
          Array.isArray(m.requests) &&
          m.requests.length <= 32 &&
          m.requests.every((id) => typeof id === "string" && id.length <= 64)),
    ) ||
    !Array.isArray(r.shots) ||
    r.shots.length !== 2 ||
    !r.shots.every(
      (list) =>
        Array.isArray(list) &&
        list.length <= 100 &&
        list.every(
          (s) =>
            isGridPoint(s.x, s.y) &&
            ["miss", "body", "head"].includes(s.result) &&
            (!s.revealed ||
              (s.result === "head" &&
                isPlane(s.revealed) &&
                s.revealed.x === s.x &&
                s.revealed.y === s.y)),
        ),
    ) ||
    (r.completedPlanes !== undefined &&
      (!Array.isArray(r.completedPlanes) ||
        r.completedPlanes.length !== 2 ||
        !r.completedPlanes.every(
          (planes) => planes === null || legalFleet(planes),
        ))) ||
    ![null, 0, 1].includes(r.turn) ||
    ![null, 0, 1].includes(r.winner) ||
    ![null, "fleet", "left", "connection", "timeout"].includes(r.reason) ||
    (r.deadline !== null && (!Number.isFinite(r.deadline) || r.deadline < 0)) ||
    (r.members[0] && r.members[0]?.owner === r.members[1]?.owner)
  )
    throw Error("Invalid stored Planes match");
  if (
    r.event &&
    (!Number.isSafeInteger(r.event.id) ||
      !Number.isFinite(r.event.at) ||
      typeof r.event.actor !== "string" ||
      typeof r.event.target !== "string" ||
      !["miss", "body", "head"].includes(r.event.result) ||
      ![null, 0, 1].includes(r.event.winner))
  )
    throw Error("Invalid stored Planes event");
  const record = structuredClone(r);
  // Legacy finished rounds are safe to freeze only before either player has
  // supplied a rematch fleet. Otherwise omit the unavailable historical reveal.
  if (
    record.phase === "finished" &&
    record.winner !== null &&
    !record.completedPlanes &&
    record.members.every((member) => !member?.ready)
  ) {
    record.completedPlanes = structuredClone(
      record.members.map((member) => member?.planes ?? null),
    ) as NonNullable<PlanesRecord["completedPlanes"]>;
  }
  return record;
}
export function nextPlanesDeadline(record: PlanesRecord): number | null {
  const times = record.members.flatMap((m) =>
    m?.awayUntil === null || !m ? [] : [m.awayUntil],
  );
  if (record.deadline !== null) times.push(record.deadline);
  return times.length ? Math.min(...times) : null;
}
export class TableError extends Error {}
export class PlanesTable {
  private state: PlanesRecord;
  private pending: Promise<void> = Promise.resolve();
  private dirtyDisconnect = false;
  get needsFlush() {
    return this.dirtyDisconnect;
  }
  constructor(
    private runtime: {
      save: (record: PlanesRecord) => Promise<void>;
      random?: () => number;
    },
    stored?: unknown,
  ) {
    this.state = readPlanesRecord(stored);
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation);
    this.pending = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  private async commit(next: PlanesRecord) {
    next.revision = this.state.revision + 1;
    await this.runtime.save(next);
    this.state = next;
    this.dirtyDisconnect = false;
  }
  async flush() {
    return this.serial(async () => {
      if (this.dirtyDisconnect) {
        await this.runtime.save(this.state);
        this.dirtyDisconnect = false;
      }
    });
  }
  private side(actor: TableActor, record = this.state): Side | null {
    const i = record.members.findIndex(
      (m) =>
        m?.owner === actor.owner &&
        m.socket === actor.socket &&
        m.awayUntil === null,
    );
    return i < 0 ? null : (i as Side);
  }
  sideFor(actor: TableActor) {
    return this.side(actor);
  }
  canResume(actor: TableActor, now: number) {
    return this.state.members.some(
      (m) =>
        m?.owner === actor.owner && m.awayUntil !== null && m.awayUntil > now,
    );
  }
  hasSocket(socket: string) {
    return this.state.members.some(
      (m) => m?.socket === socket && m.awayUntil === null,
    );
  }
  hasOtherSocket(actor: TableActor) {
    return this.state.members.some(
      (m) =>
        m?.owner === actor.owner &&
        m.socket !== actor.socket &&
        m.awayUntil === null,
    );
  }
  async bindActor(actor: TableActor): Promise<void> {
    return this.serial(async () => {
      const index = this.state.members.findIndex(
        (m) => m?.socket === actor.socket && m.awayUntil === null,
      );
      if (index < 0) return;
      const old = this.state.members[index]!;
      if (old.owner === actor.owner && old.name === actor.name) return;
      if (old.owner !== actor.owner && !old.owner.startsWith("session:"))
        return;
      if (
        this.state.members.some(
          (m, i) => i !== index && m?.owner === actor.owner,
        )
      )
        throw new TableError("This player already has a seat.");
      const next = structuredClone(this.state);
      Object.assign(next.members[index]!, actor);
      await this.commit(next);
    });
  }
  async reconcileConnections(
    live: ReadonlySet<string>,
    now = Date.now(),
  ): Promise<void> {
    return this.serial(async () => {
      const missing = this.state.members.filter(
        (m) => m && m.awayUntil === null && !live.has(m.socket),
      );
      if (!missing.length) return;
      const next = structuredClone(this.state);
      next.members.forEach((m) => {
        if (m && m.awayUntil === null && !live.has(m.socket))
          m.awayUntil = now + PLANES_RECONNECT_MS;
      });
      if (next.phase === "playing" || next.phase === "setup")
        next.deadline = null;
      await this.commit(next);
    });
  }
  private freshRound(next: PlanesRecord, now = Date.now()) {
    delete next.completedPlanes;
    next.phase = next.members.every(Boolean) ? "setup" : "lobby";
    next.shots = [[], []];
    next.turn = null;
    next.winner = null;
    next.reason = null;
    next.event = null;
    for (const m of next.members)
      if (m) {
        m.ready = false;
        m.planes = randomFleet(this.runtime.random);
        m.requests = [];
      }
    next.deadline = next.phase === "setup" ? now + 120_000 : null;
  }
  private startPlaying(next: PlanesRecord, now: number) {
    delete next.completedPlanes;
    next.phase = "playing";
    next.round++;
    next.shots = [[], []];
    next.reason = null;
    next.winner = null;
    next.event = null;
    next.turn = (this.runtime.random ?? Math.random)() < 0.5 ? 0 : 1;
    next.deadline = now + 60_000;
  }
  private resumeClock(next: PlanesRecord, now: number) {
    if (!next.members.every((m) => m && m.awayUntil === null)) return;
    // Also recover an already-saved setup from the earlier readiness race.
    if (next.phase === "setup" && next.members.every((m) => m?.ready))
      this.startPlaying(next, now);
    else if (next.phase === "playing" || next.phase === "setup")
      next.deadline = now + (next.phase === "playing" ? 60_000 : 120_000);
  }
  private finish(
    next: PlanesRecord,
    winner: Side | null,
    reason: PlanesView["reason"],
  ) {
    next.completedPlanes = structuredClone(
      next.members.map((member) => member?.planes ?? null),
    ) as NonNullable<PlanesRecord["completedPlanes"]>;
    next.phase = "finished";
    next.winner = winner;
    next.reason = reason;
    next.turn = null;
    next.deadline = null;
    next.members.forEach((m) => {
      if (m) m.ready = false;
    });
  }
  async join(actor: TableActor, side: Side, now = Date.now()): Promise<void> {
    return this.serial(async () => {
      const next = structuredClone(this.state);
      const existing = next.members.findIndex(
        (m) => m?.owner === actor.owner || m?.socket === actor.socket,
      );
      if (existing >= 0 && existing !== side)
        throw new TableError("You already have the other seat.");
      const occupant = next.members[side];
      if (
        occupant?.owner === actor.owner &&
        occupant.awayUntil === null &&
        occupant.socket !== actor.socket
      )
        throw new TableError("This match is open in your other tab.");
      if (occupant && occupant.owner !== actor.owner)
        throw new TableError(
          occupant.awayUntil
            ? "This player's connection is recovering."
            : "Someone is playing in this seat.",
        );
      if (occupant) {
        if (
          occupant.awayUntil === null &&
          occupant.socket === actor.socket &&
          occupant.name === actor.name
        )
          return;
        if (occupant.awayUntil !== null && occupant.awayUntil <= now)
          throw new TableError("That match has expired.");
        Object.assign(occupant, {
          socket: actor.socket,
          name: actor.name,
          awayUntil: null,
        });
        this.resumeClock(next, now);
      } else {
        if (next.phase === "playing")
          throw new TableError("Wait for this round to finish.");
        next.members[side] = {
          ...actor,
          ready: false,
          planes: randomFleet(this.runtime.random),
          awayUntil: null,
          requests: [],
        };
        this.freshRound(next, now);
      }
      await this.commit(next);
    });
  }
  async resume(actor: TableActor, now = Date.now()): Promise<Side | null> {
    return this.serial(async () => {
      const side = this.state.members.findIndex(
        (m) =>
          m?.owner === actor.owner && m.awayUntil !== null && m.awayUntil > now,
      );
      if (side < 0) return null;
      const next = structuredClone(this.state);
      Object.assign(next.members[side]!, {
        socket: actor.socket,
        name: actor.name,
        awayUntil: null,
      });
      this.resumeClock(next, now);
      await this.commit(next);
      return side as Side;
    });
  }
  async leave(actor: TableActor, now = Date.now()): Promise<boolean> {
    return this.serial(async () => {
      const side = this.side(actor);
      if (side === null) return false;
      const next = structuredClone(this.state);
      if (next.phase === "playing")
        this.finish(
          next,
          next.members[otherSide(side)] ? otherSide(side) : null,
          "left",
        );
      next.members[side] = null;
      if (!next.members.some(Boolean)) {
        const empty = emptyRecord();
        empty.round = next.round;
        await this.commit(empty);
        return true;
      }
      if (next.phase !== "finished") this.freshRound(next, now);
      await this.commit(next);
      return true;
    });
  }
  async disconnect(actor: TableActor, now = Date.now()): Promise<boolean> {
    return this.serial(async () => {
      const side = this.side(actor);
      if (side === null) return false;
      const next = structuredClone(this.state);
      next.members[side]!.awayUntil = now + PLANES_RECONNECT_MS;
      if (next.phase === "playing" || next.phase === "setup")
        next.deadline = null;
      try {
        await this.commit(next);
      } catch (error) {
        // This is an observed closed socket, not a successful user move. Keep it
        // away in memory and retry persistence; never let a ghost own a live role.
        this.state = next;
        this.dirtyDisconnect = true;
        throw error;
      }
      return true;
    });
  }
  async expire(now = Date.now()): Promise<boolean> {
    return this.serial(async () => {
      const expired = ([0, 1] as Side[]).filter((side) => {
        const t = this.state.members[side]?.awayUntil;
        return t !== undefined && t !== null && t <= now;
      });
      if (
        !expired.length &&
        !(this.state.deadline !== null && this.state.deadline <= now)
      )
        return false;
      const next = structuredClone(this.state);
      if (!expired.length && next.phase === "playing" && next.turn !== null) {
        const loser = next.turn;
        this.finish(next, otherSide(loser), "timeout");
        next.members[loser] = null;
      } else if (!expired.length && next.phase === "setup") {
        next.members.forEach((m, side) => {
          if (m && !m.ready) next.members[side as Side] = null;
        });
      }
      if (next.phase === "playing") {
        const survivor = ([0, 1] as Side[]).find(
          (side) => !expired.includes(side) && next.members[side],
        );
        this.finish(next, survivor ?? null, "connection");
      }
      expired.forEach((side) => (next.members[side] = null));
      if (!next.members.some(Boolean)) {
        const empty = emptyRecord();
        empty.round = next.round;
        await this.commit(empty);
        return true;
      }
      if (next.phase !== "finished") this.freshRound(next, now);
      await this.commit(next);
      return true;
    });
  }
  async act(
    actor: TableActor,
    action: PlanesAction,
    requestId: string,
    revision: number,
    now = Date.now(),
  ): Promise<void> {
    if (action.kind === "leave") {
      await this.leave(actor, now);
      return;
    }
    return this.serial(async () => {
      const side = this.side(actor);
      if (side === null) throw new TableError("Sit in a Planes seat to play.");
      const current = this.state.members[side]!;
      if (current.requests.includes(requestId)) return;
      if (this.state.deadline !== null && this.state.deadline <= now)
        throw new TableError(
          "The turn expired. Waiting for the table to update.",
        );
      const concurrentReady =
        (action.kind === "ready" || action.kind === "rematch") &&
        revision === this.state.revision - 1 &&
        this.state.members[otherSide(side)]?.ready &&
        !current.ready;
      if (revision !== this.state.revision && !concurrentReady)
        throw new TableError("The table changed. Try that move again.");
      const next = structuredClone(this.state),
        member = next.members[side]!,
        opponent = next.members[otherSide(side)];
      if (action.kind === "ready" || action.kind === "rematch") {
        if (
          (action.kind === "ready" &&
            !["lobby", "setup"].includes(next.phase)) ||
          (action.kind === "rematch" && next.phase !== "finished")
        )
          throw new TableError("That round has already started.");
        if (!opponent)
          throw new TableError("Waiting for someone in the opposite seat.");
        if (opponent.awayUntil !== null)
          throw new TableError(
            "Your opponent is reconnecting. Ready up when they return.",
          );
        if (member.ready)
          throw new TableError("You're ready. Waiting for your opponent.");
        if (!legalFleet(action.planes))
          throw new TableError(
            "Keep three complete planes on the paper, without overlaps.",
          );
        member.planes = action.planes.map((p) => ({ ...p }));
        member.ready = true;
        if (next.members.every((m) => m?.ready && m.awayUntil === null)) {
          this.startPlaying(next, now);
        }
      } else {
        if (next.phase !== "playing" || next.turn !== side)
          throw new TableError("Wait for your turn.");
        if (!opponent || opponent.awayUntil !== null)
          throw new TableError("Your opponent is reconnecting.");
        if (
          !isGridPoint(action.x, action.y) ||
          targetUnavailable(action.x, action.y, next.shots[side])
        )
          throw new TableError("Choose an unmarked square.");
        const shot = resolveShot(
          opponent.planes,
          next.shots[side],
          action.x,
          action.y,
        );
        next.shots[side].push(shot);
        const won = opponent.planes.every((p) =>
          destroyed(p, next.shots[side]),
        );
        if (won) this.finish(next, side, "fleet");
        else {
          next.turn = otherSide(side);
          next.deadline = now + 60_000;
        }
        next.event = {
          id: next.revision + 1,
          at: now,
          actor: actor.socket,
          target: opponent.socket,
          result: shot.result,
          winner: won ? side : null,
        };
      }
      member.requests = [...member.requests, requestId].slice(-32);
      await this.commit(next);
    });
  }
  view(actor: TableActor | null): PlanesView {
    const r = this.state,
      you = actor ? this.side(actor) : null;
    return structuredClone({
      version: 1,
      revision: r.revision,
      round: r.round,
      phase: r.phase,
      players: r.members.map((m, side) =>
        m
          ? {
              name: m.name,
              online: m.awayUntil === null,
              ready: m.ready,
              remaining:
                3 -
                r.shots[otherSide(side as Side)].filter(
                  (s) => s.result === "head",
                ).length,
              awayUntil: m.awayUntil,
            }
          : null,
      ) as PlanesView["players"],
      you,
      ownPlanes: you === null ? null : r.members[you]!.planes,
      ...(r.phase === "finished" && r.winner !== null && r.completedPlanes
        ? { revealedPlanes: r.completedPlanes }
        : {}),
      shots: r.shots,
      turn: r.turn,
      winner: r.winner,
      reason: r.reason,
      event: r.event,
      deadline: r.deadline,
    });
  }
}
