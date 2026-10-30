import {
  activeCruceSeats,
  beginCruceRound,
  collectCruceTrick,
  CruceError,
  freshCruce,
  legalCruceCards,
  moveCruce,
  validCruceSettings,
  isCard,
  type CruceAction,
  type CruceGame,
  type CruceSeat,
  type CruceView,
} from "../../packages/shared/cruce";
import { CRUCE_RECONNECT_MS } from "../../packages/shared/cruce-station";
import type { TableActor } from "./planes-table";
type Member = TableActor & {
  ready: boolean;
  awayUntil: number | null;
  requests: string[];
};
export type CruceRecord = {
  version: 1;
  revision: number;
  readySince: number;
  overdueSinceRevision: number | null;
  hostOwner: string | null;
  game: CruceGame;
  members: (Member | null)[];
  deadline: number | null;
};
const empty = (): CruceRecord => ({
  version: 1,
  revision: 0,
  readySince: 0,
  overdueSinceRevision: null,
  hostOwner: null,
  game: freshCruce(),
  members: [null, null, null, null],
  deadline: null,
});
export function readCruceRecord(value: unknown): CruceRecord {
  if (value === undefined) return empty();
  const r = value as CruceRecord;
  const list = (v: unknown, n = 4): v is unknown[] =>
    Array.isArray(v) && v.length === n;
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const g = r?.game;
  if (
    !r ||
    r.version !== 1 ||
    !Number.isSafeInteger(r.revision) ||
    r.revision < 0 ||
    (r.readySince !== undefined &&
      (!Number.isSafeInteger(r.readySince) ||
        r.readySince < 0 ||
        r.readySince > r.revision)) ||
    (r.overdueSinceRevision !== undefined &&
      r.overdueSinceRevision !== null &&
      (!Number.isSafeInteger(r.overdueSinceRevision) ||
        r.overdueSinceRevision < 0 ||
        r.overdueSinceRevision > r.revision)) ||
    !g ||
    !validCruceSettings(g.settings) ||
    ![
      "lobby",
      "cut",
      "bidding",
      "trump",
      "exchange",
      "playing",
      "trick",
      "round-end",
      "finished",
    ].includes(g.phase) ||
    !Number.isSafeInteger(g.round) ||
    g.round < 0 ||
    ![0, 1, 2, 3].includes(g.dealer) ||
    ![null, 0, 1, 2, 3].includes(g.turn) ||
    ![null, 0, 1, 2, 3].includes(g.bidder) ||
    ![null, 0, 1, 2, 3].includes(g.trump) ||
    !Number.isInteger(g.bid) ||
    g.bid < 0 ||
    g.bid > 6 ||
    !list(g.bids) ||
    !g.bids.every(
      (v) =>
        v === null || (Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 6),
    ) ||
    !list(g.hands) ||
    !list(g.captured) ||
    ![...g.hands, ...g.captured, g.stock].every(
      (v) => Array.isArray(v) && v.length <= 24 && v.every(isCard),
    ) ||
    ![g.trick, g.lastTrick].every(
      (t) =>
        Array.isArray(t) &&
        t.length <= 4 &&
        t.every(
          (p) =>
            p &&
            isCard(p.card) &&
            [0, 1, 2, 3].includes(p.seat) &&
            [0, 20, 40].includes(p.announcement),
        ),
    ) ||
    ![g.scores, g.roundPoints, g.roundScores, g.announcements].every(
      (v) => list(v) && v.every(finite),
    ) ||
    !Array.isArray(g.announced) ||
    !g.announced.every((v) => [0, 1, 2, 3].includes(v)) ||
    !Array.isArray(g.given) ||
    !g.given.every((v) => [0, 1, 2, 3].includes(v)) ||
    ![null, 0, 1, 2, 3].includes(g.trickWinner) ||
    ![null, 0, 1, 2, 3].includes(g.winner) ||
    typeof g.notice !== "string" ||
    !Array.isArray(g.violations) ||
    !g.violations.every(
      (v) =>
        v &&
        isCard(v.card) &&
        [0, 1, 2, 3].includes(v.seat) &&
        Number.isInteger(v.round),
    ) ||
    !list(r.members) ||
    !r.members.every(
      (m) =>
        m === null ||
        (m &&
          typeof m.owner === "string" &&
          m.owner.length <= 100 &&
          typeof m.socket === "string" &&
          m.socket.length <= 100 &&
          typeof m.name === "string" &&
          m.name.length <= 24 &&
          !/[\p{C}<>]/u.test(m.name) &&
          typeof m.ready === "boolean" &&
          (m.awayUntil === null || finite(m.awayUntil)) &&
          Array.isArray(m.requests) &&
          m.requests.length <= 32 &&
          m.requests.every((id) => typeof id === "string" && id.length <= 64)),
    ) ||
    (r.deadline !== null && !finite(r.deadline))
  )
    throw Error("Invalid stored Cruce match");
  if (
    r.hostOwner !== undefined &&
    r.hostOwner !== null &&
    (typeof r.hostOwner !== "string" ||
      !r.members.some((m) => m?.owner === r.hostOwner))
  )
    throw Error("Invalid Cruce host");
  const owners = r.members.flatMap((m) => (m ? [m.owner] : []));
  if (new Set(owners).size !== owners.length)
    throw Error("Duplicate Cruce member");
  const cards = [
    ...g.hands.flat(),
    ...g.stock,
    ...g.captured.flat(),
    ...g.trick.map((p) => p.card),
  ];
  if (
    new Set(cards).size !== cards.length ||
    (g.round > 0 && g.phase !== "finished" && cards.length !== 24)
  )
    throw Error("Invalid stored Cruce deck");
  return {
    ...structuredClone(r),
    readySince: r.readySince ?? r.revision,
    overdueSinceRevision: r.overdueSinceRevision ?? null,
    hostOwner: r.hostOwner ?? r.members.find((m) => m)?.owner ?? null,
  };
}
export function nextCruceDeadline(r: CruceRecord): number | null {
  const times = r.members.flatMap((m) =>
    m?.awayUntil === null || !m ? [] : [m.awayUntil],
  );
  if (
    r.deadline !== null &&
    (r.game.phase === "trick" ||
      r.overdueSinceRevision === null ||
      r.overdueSinceRevision === undefined)
  )
    times.push(r.deadline);
  return times.length ? Math.min(...times) : null;
}
export class CruceTable {
  private state: CruceRecord;
  private pending: Promise<void> = Promise.resolve();
  private dirty = false;
  get needsFlush() {
    return this.dirty;
  }
  constructor(
    private runtime: {
      save: (r: CruceRecord) => Promise<void>;
      random?: () => number;
    },
    stored?: unknown,
  ) {
    this.state = readCruceRecord(stored);
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const operation = this.pending.then(fn);
    this.pending = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
  private async commit(r: CruceRecord) {
    r.revision = this.state.revision + 1;
    await this.runtime.save(r);
    this.state = r;
    this.dirty = false;
  }
  async flush() {
    return this.serial(async () => {
      if (this.dirty) {
        await this.runtime.save(this.state);
        this.dirty = false;
      }
    });
  }
  sideFor(a: TableActor): CruceSeat | null {
    const i = this.state.members.findIndex(
      (m) =>
        m?.owner === a.owner && m.socket === a.socket && m.awayUntil === null,
    );
    return i < 0 ? null : (i as CruceSeat);
  }
  hasSocket(socket: string) {
    return this.state.members.some(
      (m) => m?.socket === socket && m.awayUntil === null,
    );
  }
  hasOtherSocket(a: TableActor) {
    return this.state.members.some(
      (m) =>
        m?.owner === a.owner && m.socket !== a.socket && m.awayUntil === null,
    );
  }
  canResume(a: TableActor, now: number) {
    return this.state.members.some(
      (m) => m?.owner === a.owner && m.awayUntil !== null && m.awayUntil > now,
    );
  }
  private clock(r: CruceRecord, now: number) {
    r.overdueSinceRevision = null;
    const active = activeCruceSeats(r.game.settings.mode);
    const online = active.every(
      (s) => r.members[s] && r.members[s]!.awayUntil === null,
    );
    if (online && r.game.phase === "cut")
      r.game = moveCruce(
        r.game,
        r.game.turn!,
        { kind: "cut", cut: false },
        this.runtime.random,
      );
    r.deadline =
      online && r.game.phase === "trick"
        ? now + 1800
        : online && r.game.turn !== null
          ? now + 60_000
          : null;
  }
  private abort(r: CruceRecord, notice: string) {
    r.readySince = this.state.revision + 1;
    r.game.phase = "finished";
    r.game.winner = null;
    r.game.turn = null;
    r.game.notice = notice;
    r.game.hands = [[], [], [], []];
    r.game.stock = [];
    r.game.trick = [];
    r.deadline = null;
    r.members.forEach((m) => {
      if (m) m.ready = false;
    });
  }
  async bindActor(a: TableActor) {
    return this.serial(async () => {
      const index = this.state.members.findIndex(
        (m) => m?.socket === a.socket && m.awayUntil === null,
      );
      if (index < 0) return;
      const old = this.state.members[index]!;
      if (old.owner === a.owner && old.name === a.name) return;
      if (old.owner !== a.owner && !old.owner.startsWith("session:")) return;
      if (
        this.state.members.some((m, i) => i !== index && m?.owner === a.owner)
      )
        throw new CruceError("Ai deja un loc la masă.");
      const r = structuredClone(this.state);
      if (r.hostOwner === r.members[index]!.owner) r.hostOwner = a.owner;
      Object.assign(r.members[index]!, a);
      await this.commit(r);
    });
  }
  async join(a: TableActor, seat: CruceSeat, now = Date.now()) {
    return this.serial(async () => {
      const r = structuredClone(this.state),
        occupant = r.members[seat];
      if (!activeCruceSeats(r.game.settings.mode).includes(seat))
        throw new CruceError(
          "Acest loc nu se folosește în varianta aleasă. Alege unul dintre locurile active.",
        );
      const previous = r.members.findIndex(
        (m, i) =>
          i !== seat && (m?.owner === a.owner || m?.socket === a.socket),
      );
      if (previous >= 0) {
        const old = r.members[previous]!;
        if (
          old.socket !== a.socket ||
          old.awayUntil !== null ||
          !["lobby", "finished"].includes(r.game.phase)
        )
          throw new CruceError(
            "Poți schimba locul doar înaintea unei partide, din fila în care joci.",
          );
        if (occupant) throw new CruceError("Locul ales este ocupat.");
        r.members[previous] = null;
        r.members.forEach((m) => {
          if (m) m.ready = false;
        });
      }
      if (occupant && occupant.owner !== a.owner)
        throw new CruceError(
          "Locul este ocupat sau rezervat unui jucător care se reconectează.",
        );
      if (
        occupant &&
        occupant.awayUntil === null &&
        occupant.socket !== a.socket
      )
        throw new CruceError(
          "Ai deja Cruce deschis în altă filă. Continuă acolo sau închide fila respectivă.",
        );
      if (
        occupant?.awayUntil !== null &&
        occupant?.awayUntil !== undefined &&
        occupant.awayUntil <= now
      )
        throw new CruceError(
          "Rezervarea locului a expirat. Alege din nou un loc liber.",
        );
      if (!occupant && !["lobby", "finished"].includes(r.game.phase))
        throw new CruceError(
          "Așteaptă încheierea partidei ca să te poți așeza.",
        );
      if (
        occupant &&
        occupant.socket === a.socket &&
        occupant.name === a.name &&
        occupant.awayUntil === null
      )
        return;
      r.hostOwner ??= a.owner;
      r.readySince = this.state.revision + 1;
      r.members.forEach((m) => {
        if (m) m.ready = false;
      });
      r.members[seat] = occupant
        ? { ...occupant, ...a, awayUntil: null }
        : { ...a, ready: false, awayUntil: null, requests: [] };
      this.clock(r, now);
      await this.commit(r);
    });
  }
  async resume(a: TableActor, now = Date.now()): Promise<CruceSeat | null> {
    return this.serial(async () => {
      const i = this.state.members.findIndex(
        (m) =>
          m?.owner === a.owner && m.awayUntil !== null && m.awayUntil > now,
      );
      if (i < 0) return null;
      const r = structuredClone(this.state);
      Object.assign(r.members[i]!, a, { awayUntil: null });
      this.clock(r, now);
      await this.commit(r);
      return i as CruceSeat;
    });
  }
  async leave(a: TableActor) {
    return this.serial(async () => {
      const seat = this.sideFor(a);
      if (seat === null) return false;
      const r = structuredClone(this.state);
      r.members[seat] = null;
      if (r.hostOwner === a.owner)
        r.hostOwner = r.members.find((m) => m)?.owner ?? null;
      if (r.game.phase !== "lobby")
        this.abort(
          r,
          "Un jucător s-a ridicat de la masă. Partida s-a oprit. Apăsați „Pregătit” pentru o partidă nouă.",
        );
      if (!r.members.some(Boolean)) {
        const blank = empty();
        blank.revision = r.revision;
        await this.commit(blank);
      } else await this.commit(r);
      return true;
    });
  }
  async disconnect(a: TableActor, now = Date.now()) {
    return this.serial(async () => {
      const seat = this.sideFor(a);
      if (seat === null) return false;
      const r = structuredClone(this.state);
      r.members[seat]!.awayUntil = now + CRUCE_RECONNECT_MS;
      r.deadline = null;
      try {
        await this.commit(r);
      } catch (error) {
        this.state = r;
        this.dirty = true;
        throw error;
      }
      return true;
    });
  }
  async reconcileConnections(live: ReadonlySet<string>, now = Date.now()) {
    return this.serial(async () => {
      const r = structuredClone(this.state);
      let changed = false;
      for (const m of r.members)
        if (m && m.awayUntil === null && !live.has(m.socket)) {
          m.awayUntil = now + CRUCE_RECONNECT_MS;
          changed = true;
        }
      if (changed) {
        r.deadline = null;
        await this.commit(r);
      }
    });
  }
  async expire(now = Date.now()) {
    return this.serial(async () => {
      const r = structuredClone(this.state);
      const expired = r.members.flatMap((m, i) =>
        m?.awayUntil !== null &&
        m?.awayUntil !== undefined &&
        m.awayUntil <= now
          ? [i]
          : [],
      );
      if (expired.length) {
        expired.forEach((i) => (r.members[i] = null));
        if (!r.members.some((m) => m?.owner === r.hostOwner))
          r.hostOwner = r.members.find((m) => m)?.owner ?? null;
        this.abort(
          r,
          "Un jucător nu s-a reconectat la timp. Partida s-a oprit. Puteți începe o partidă nouă.",
        );
        await this.commit(r.members.some(Boolean) ? r : empty());
        return true;
      }
      const active = activeCruceSeats(r.game.settings.mode);
      if (
        r.game.phase === "cut" &&
        active.every((s) => r.members[s]?.awayUntil === null)
      ) {
        this.clock(r, now);
        await this.commit(r);
        return true;
      }
      if (
        r.deadline === null &&
        r.game.phase === "trick" &&
        r.game.trick.length === active.length &&
        r.game.trickWinner !== null &&
        active.every((s) => r.members[s]?.awayUntil === null)
      )
        r.deadline = now;
      if (
        r.deadline === null ||
        r.deadline > now ||
        (r.overdueSinceRevision !== null && r.game.phase !== "trick")
      )
        return false;
      if (r.game.phase === "trick") {
        r.game = collectCruceTrick(r.game);
        if (["round-end", "finished"].includes(r.game.phase))
          r.readySince = this.state.revision + 1;
        this.clock(r, now);
      } else {
        r.overdueSinceRevision = this.state.revision;
        r.game.notice =
          "Timpul a expirat. Îl așteptăm pe jucătorul aflat la rând; partida continuă.";
      }
      await this.commit(r);
      return true;
    });
  }
  async act(
    a: TableActor,
    action: CruceAction,
    requestId: string,
    revision: number,
    now = Date.now(),
  ) {
    if (action.kind === "leave") {
      await this.leave(a);
      return;
    }
    return this.serial(async () => {
      const seat = this.sideFor(a);
      if (seat === null)
        throw new CruceError("Așază-te la masa de Cruce ca să poți juca.");
      if (this.state.members[seat]!.requests.includes(requestId)) return;
      const concurrentReady =
        (action.kind === "ready" || action.kind === "continue") &&
        revision >= this.state.readySince &&
        revision <= this.state.revision &&
        !this.state.members[seat]!.ready;
      const afterSoftDeadline =
        this.state.overdueSinceRevision !== null &&
        revision >= this.state.overdueSinceRevision &&
        revision <= this.state.revision &&
        !["configure", "ready", "continue"].includes(action.kind);
      if (
        revision !== this.state.revision &&
        !concurrentReady &&
        !afterSoftDeadline
      )
        throw new CruceError(
          "Masa s-a actualizat între timp. Încearcă din nou.",
        );
      const r = structuredClone(this.state),
        g = r.game,
        actingMember = r.members[seat]!;
      if (g.phase === "trick" && r.deadline !== null && r.deadline <= now)
        throw new CruceError("Timpul a expirat. Așteptăm actualizarea mesei.");
      if (action.kind === "configure") {
        if (
          !["lobby", "finished"].includes(g.phase) ||
          r.members[seat]?.owner !== r.hostOwner
        )
          throw new CruceError(
            "Doar primul jucător așezat la masă poate modifica regulile, înaintea unei partide.",
          );
        if (!validCruceSettings(action.settings))
          throw new CruceError("Alege o configurație validă pentru partidă.");
        const active = activeCruceSeats(action.settings.mode);
        if (r.members.filter(Boolean).length > active.length)
          throw new CruceError(
            `Sunt ${r.members.filter(Boolean).length} jucători la masă. Varianta aleasă acceptă ${active.length}; alege o variantă cu suficiente locuri.`,
          );
        const placed: (Member | null)[] = [null, null, null, null];
        r.members.forEach((member, index) => {
          if (member && active.includes(index as CruceSeat))
            placed[index] = member;
        });
        r.members.forEach((member, index) => {
          if (!member || active.includes(index as CruceSeat)) return;
          const free = active.filter((seat) => !placed[seat]);
          free.sort(
            (a, b) =>
              Math.min(Math.abs(a - index), 4 - Math.abs(a - index)) -
              Math.min(Math.abs(b - index), 4 - Math.abs(b - index)),
          );
          placed[free[0]] = member;
        });
        r.members = placed;
        r.deadline = null;
        r.overdueSinceRevision = null;
        r.readySince = this.state.revision + 1;
        r.game = freshCruce(action.settings);
        r.members.forEach((m) => {
          if (m) m.ready = false;
        });
      } else if (action.kind === "ready" || action.kind === "continue") {
        if (
          !(action.kind === "continue"
            ? g.phase === "round-end"
            : ["lobby", "finished"].includes(g.phase))
        )
          throw new CruceError("Runda a început deja.");
        const active = activeCruceSeats(g.settings.mode);
        if (!active.every((s) => r.members[s]?.awayUntil === null))
          throw new CruceError(
            "Așteaptă ca toate locurile necesare să fie ocupate și toți jucătorii să fie conectați.",
          );
        r.members[seat]!.ready = true;
        if (active.every((s) => r.members[s]?.ready)) {
          const previous = g.phase === "finished" ? freshCruce(g.settings) : g;
          r.readySince = this.state.revision + 1;
          r.game = beginCruceRound(previous, this.runtime.random);
          r.members.forEach((m) => {
            if (m) m.ready = false;
          });
          this.clock(r, now);
        }
      } else {
        if (
          !activeCruceSeats(g.settings.mode).every(
            (s) => r.members[s]?.awayUntil === null,
          )
        )
          throw new CruceError(
            "Runda este în pauză până se reconectează jucătorul.",
          );
        r.game = moveCruce(g, seat, action, this.runtime.random);
        if (
          r.game.phase !== g.phase &&
          ["round-end", "finished"].includes(r.game.phase)
        )
          r.readySince = this.state.revision + 1;
        this.clock(r, now);
      }
      actingMember.requests = [...actingMember.requests, requestId].slice(-32);
      await this.commit(r);
    });
  }
  view(a: TableActor | null): CruceView {
    const r = this.state,
      you = a ? this.sideFor(a) : null;
    const {
      hands,
      stock,
      captured: _captured,
      violations: _private,
      ...publicGame
    } = r.game;
    return structuredClone({
      ...publicGame,
      version: 1,
      revision: r.revision,
      you,
      hand: you === null ? [] : hands[you],
      handCounts: hands.map((h) => h.length),
      stockCount: stock.length,
      legalCards:
        you !== null && r.game.turn === you && r.game.phase === "playing"
          ? legalCruceCards(r.game, you)
          : [],
      players: r.members.map((m) =>
        m
          ? {
              name: m.name,
              online: m.awayUntil === null,
              ready: m.ready,
              awayUntil: m.awayUntil,
            }
          : null,
      ),
      deadline: r.deadline,
      turnOverdue: r.overdueSinceRevision !== null,
      host:
        r.hostOwner === null
          ? null
          : (r.members.findIndex((m) => m?.owner === r.hostOwner) as CruceSeat),
    });
  }
}
