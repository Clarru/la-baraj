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
};
export class ArcadeError extends Error {}
const secureRandom = () =>
  crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const integer = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
export class Arcade2048Service {
  private records = new Map<string, ArcadeRecord>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private store: {
      ranked?: boolean;
      save: (owner: string, record: ArcadeRecord) => Promise<void>;
    },
    stored: unknown[] = [],
    private random = secureRandom,
  ) {
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
        this.records.has(r.owner)
      )
        throw new ArcadeError("Invalid stored arcade progress");
      this.records.set(r.owner, structuredClone(r));
    }
  }
  view(owner: string): ArcadeView {
    const r = this.records.get(owner);
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
      game: r ? structuredClone(r.game) : null,
      best: r?.best ?? 0,
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
      if (action.kind === "leaders") return this.view(owner);
      if (old?.requests.includes(requestId)) return this.view(owner);
      if (action.kind === "resume" && old) {
        if (old.name !== name) {
          const renamed = { ...old, name };
          await this.store.save(owner, renamed);
          this.records.set(owner, renamed);
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
        if (!arcadeWon(old!.game)) return this.view(owner);
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
      await this.store.save(owner, structuredClone(record));
      this.records.set(owner, record);
      return this.view(owner);
    };
    const result = this.queue.then(execute);
    this.queue = result.catch(() => {});
    return result;
  }
}
