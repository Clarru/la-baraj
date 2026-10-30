/** Classic 4x4 2048 rules. Random spawns and accepted scores belong to the server. */
export type ArcadeDirection = "left" | "right" | "up" | "down";
export type ArcadeAction =
  | { kind: "resume" }
  | { kind: "new" }
  | { kind: "leaders" }
  | { kind: "continue" }
  | { kind: "leave" }
  | { kind: "move"; direction: ArcadeDirection };
export type ArcadeMotion = {
  from: number;
  to: number;
  value: number;
  merge: boolean;
};
export type ArcadeGame = {
  board: number[];
  score: number;
  moves: number;
  revision: number;
  continued: boolean;
};
export type ArcadeLeader = {
  rank: number;
  name: string;
  score: number;
  tile: number;
};
export type ArcadeView = {
  game: ArcadeGame | null;
  best: number;
  leaders: ArcadeLeader[];
  ranked: boolean;
};
export type ArcadeStationView = {
  id: number;
  playerId: string | null;
  name: string;
  game: ArcadeGame | null;
  best: number;
  direction: ArcadeDirection | null;
};
export const ARCADE_DIRECTIONS: ArcadeDirection[] = [
  "left",
  "right",
  "up",
  "down",
];
export function validArcadeBoard(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 16 &&
    value.every(
      (n) =>
        Number.isSafeInteger(n) &&
        (n === 0 || (n >= 2 && n <= 2 ** 30 && Number.isInteger(Math.log2(n)))),
    )
  );
}
export function parseArcadeAction(value: unknown): ArcadeAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    v.kind === "resume" ||
    v.kind === "new" ||
    v.kind === "leaders" ||
    v.kind === "continue" ||
    v.kind === "leave"
  )
    return {
      kind: v.kind as "resume" | "new" | "leaders" | "continue" | "leave",
    };
  return v.kind === "move" &&
    ARCADE_DIRECTIONS.includes(v.direction as ArcadeDirection)
    ? { kind: "move", direction: v.direction as ArcadeDirection }
    : null;
}
export function slideArcade(
  board: readonly number[],
  direction: ArcadeDirection,
) {
  const next = Array<number>(16).fill(0),
    motions: ArcadeMotion[] = [];
  let gain = 0;
  for (let line = 0; line < 4; line++) {
    const indices = Array.from({ length: 4 }, (_, i) =>
      direction === "left"
        ? line * 4 + i
        : direction === "right"
          ? line * 4 + 3 - i
          : direction === "up"
            ? i * 4 + line
            : (3 - i) * 4 + line,
    );
    const cells = indices.filter((i) => board[i] !== 0);
    let destination = 0;
    for (let i = 0; i < cells.length; i++) {
      const from = cells[i],
        to = indices[destination++],
        value = board[from];
      if (i + 1 < cells.length && board[cells[i + 1]] === value) {
        next[to] = value * 2;
        gain += value * 2;
        motions.push(
          { from, to, value, merge: true },
          { from: cells[++i], to, value, merge: true },
        );
      } else {
        next[to] = value;
        motions.push({ from, to, value, merge: false });
      }
    }
  }
  return {
    board: next,
    gain,
    motions,
    changed: next.some((value, i) => value !== board[i]),
  };
}
export function spawnArcade(board: readonly number[], random: () => number) {
  const next = [...board],
    empty = next.flatMap((v, i) => (v === 0 ? [i] : []));
  if (!empty.length) return next;
  const index =
    empty[
      Math.min(
        empty.length - 1,
        Math.floor(Math.max(0, random()) * empty.length),
      )
    ];
  next[index] = random() < 0.9 ? 2 : 4;
  return next;
}
export function newArcadeGame(random: () => number, revision = 0): ArcadeGame {
  return {
    board: spawnArcade(spawnArcade(Array(16).fill(0), random), random),
    score: 0,
    moves: 0,
    revision,
    continued: false,
  };
}
export const arcadeWon = (game: ArcadeGame) =>
  game.board.some((v) => v >= 2048);
export const arcadeOver = (game: ArcadeGame) =>
  !ARCADE_DIRECTIONS.some(
    (direction) => slideArcade(game.board, direction).changed,
  );
export function advanceArcade(
  game: ArcadeGame,
  direction: ArcadeDirection,
  random: () => number,
): ArcadeGame {
  const result = slideArcade(game.board, direction);
  return result.changed
    ? {
        ...game,
        board: spawnArcade(result.board, random),
        score: game.score + result.gain,
        moves: game.moves + 1,
        revision: game.revision + 1,
      }
    : game;
}
