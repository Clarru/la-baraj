import {
  advanceArcade,
  arcadeWon,
  newArcadeGame,
  validArcadeBoard,
  type ArcadeAction,
  type ArcadeGame,
  type ArcadeView,
} from "../../packages/shared/arcade2048";

export type ArcadeRecord = {
  version: 1;
  owner: string;
  name: string;
  game: ArcadeGame;
  best: number;
  bestTile: number;
  bestAt: number;
  requests: string[];
  /** UTC-day logical saves; optional for progress written before the budget shipped. */
  writeBudget?: { day: number; count: number };
};
export class ArcadeError extends Error {}
const secureRandom = () =>
  crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const integer = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
export const ARCADE_DAILY_WRITE_LIMIT = 50_000;
const UTC_DAY_MS = 86_400_000;
export class Arcade2048Service {
  private records = new Map<string, ArcadeRecord>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private store: {
      ranked?: boolean;
      dailyWriteLimit?: number;
      save: (owner: string, record: ArcadeRecord) => Promise<void>;
    },
    stored: unknown[] = [],
    private random = secureRandom,
  ) {
    if (!integer(store.dailyWriteLimit ?? ARCADE_DAILY_WRITE_LIMIT))
      throw new ArcadeError("Invalid arcade write budget");
    for (const value of stored) {
      const r = value as ArcadeRecord;
      if (
        !r ||
        r.version !== 1 ||
        !/^home:[0-9]+:[0-9]+$/.test(r.owner) ||
        typeof r.name !== "string" ||
        r.name.length > 24 ||
        !r.game ||
        !validArcadeBoard(r.game.board) ||
        !integer(r.game.score) ||
        !integer(r.game.moves) ||
        !integer(r.game.revision) ||
        typeof r.game.continued !== "boolean" ||
        !integer(r.best) ||
        r.best < r.game.score ||
        !integer(r.bestTile) ||
        !integer(r.bestAt) ||
        !Array.isArray(r.requests) ||
        r.requests.length > 32 ||
        !r.requests.every((id) => typeof id === "string" && id.length <= 64) ||
        (r.writeBudget !== undefined &&
          (!r.writeBudget ||
            typeof r.writeBudget !== "object" ||
            Array.isArray(r.writeBudget) ||
            !integer(r.writeBudget.day) ||
            !integer(r.writeBudget.count))) ||
        this.records.has(r.owner)
      )
        throw new ArcadeError("Invalid stored arcade progress");
      this.records.set(r.owner, structuredClone(r));
    }
  }
  private async persist(record: ArcadeRecord, now: number) {
    let next = record;
    if (this.store.ranked !== false) {
      const day = Math.floor(now / UTC_DAY_MS);
      const used = [...this.records.values()].reduce(
        (total, r) =>
          total + (r.writeBudget?.day === day ? r.writeBudget.count : 0),
        0,
      );
      if (used >= (this.store.dailyWriteLimit ?? ARCADE_DAILY_WRITE_LIMIT))
        throw new ArcadeError(
          "Saving is paused for today. Your board is safe.",
        );
      const prior = this.records.get(record.owner)?.writeBudget;
      next = {
        ...record,
        writeBudget: { day, count: prior?.day === day ? prior.count + 1 : 1 },
      };
    }
    // The meter shares this owner row: no separate quota write, and failure burns nothing.
    await this.store.save(record.owner, structuredClone(next));
    this.records.set(record.owner, next);
  }
  boardView(owner: string): Pick<ArcadeView, "game" | "best"> {
    const r = this.records.get(owner);
    return { game: r ? structuredClone(r.game) : null, best: r?.best ?? 0 };
  }
  view(owner: string): ArcadeView {
    const leaders = [...this.records.values()]
      .filter((r) => r.best > 0)
      .sort(
        (a, b) =>
          b.best - a.best ||
          a.bestAt - b.bestAt ||
          a.owner.localeCompare(b.owner),
      )
      .slice(0, 10)
      .map((r, index) => ({
        rank: index + 1,
        name: r.name,
        score: r.best,
        tile: r.bestTile,
      }));
    return {
      ...this.boardView(owner),
      leaders,
      ranked: this.store.ranked ?? true,
    };
  }
  act(
    owner: string,
    name: string,
    action: ArcadeAction,
    revision: number,
    requestId: string,
    now = Date.now(),
  ): Promise<ArcadeView> {
    const execute = async () => {
      if (!/^home:[0-9]+:[0-9]+$/.test(owner))
        throw new ArcadeError(
          "Your cabin is still being registered. Try again.",
        );
      const old = this.records.get(owner);
      if (action.kind === "leaders" || action.kind === "leave")
        return this.view(owner);
      if (old?.requests.includes(requestId)) return this.view(owner);
      if (action.kind === "resume" && old) {
        if (old.name !== name) {
          const renamed = { ...old, name };
          await this.persist(renamed, now);
        }
        return this.view(owner);
      }
      if (old && revision !== old.game.revision)
        throw new ArcadeError(
          "Your board changed in another tab. It has been refreshed.",
        );
      if (!old && !["new", "resume"].includes(action.kind))
        throw new ArcadeError("Start a game first.");
      let game: ArcadeGame;
      if (action.kind === "new" || action.kind === "resume")
        game = newArcadeGame(this.random, (old?.game.revision ?? 0) + 1);
      else if (action.kind === "continue") {
        if (!arcadeWon(old!.game) || old!.game.continued)
          return this.view(owner);
        game = {
          ...old!.game,
          continued: true,
          revision: old!.game.revision + 1,
        };
      } else {
        if (arcadeWon(old!.game) && !old!.game.continued)
          throw new ArcadeError("Choose Keep going to continue.");
        game = advanceArcade(old!.game, action.direction, this.random);
        if (game === old!.game) return this.view(owner);
      }
      const best = Math.max(old?.best ?? 0, game.score);
      const record: ArcadeRecord = {
        version: 1,
        owner,
        name,
        game,
        best,
        bestTile: Math.max(old?.bestTile ?? 0, ...game.board),
        bestAt: best > (old?.best ?? 0) ? now : (old?.bestAt ?? now),
        requests: [...(old?.requests ?? []), requestId].slice(-32),
      };
      // Commit only after persistence. A failed save leaves score/board unchanged.
      await this.persist(record, now);
      return this.view(owner);
    };
    const result = this.queue.then(execute);
    this.queue = result.catch(() => {});
    return result;
  }
}
