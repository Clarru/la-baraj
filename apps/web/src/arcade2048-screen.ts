import {
  arcadeOver,
  arcadeWon,
  slideArcade,
  type ArcadeView,
  type ArcadeMotion,
} from "../../../packages/shared/arcade2048";
export type ArcadePage = "board" | "leaders" | "confirm";
export type ScreenAction =
  "new" | "scores" | "back" | "confirm" | "continue" | "leave";
export type ArcadeScreenState = {
  view: ArcadeView | null;
  page: ArcadePage;
  active: boolean;
  pending: boolean;
  error: string;
  local: boolean;
  focused?: boolean;
  occupantName?: string;
};
export type TileAnimation = {
  started: number;
  motions: ArcadeMotion[];
  merged: number[];
  spawned: number[];
  gain: number;
};
export const ARCADE_TILE_MS = 120;
export const SCREEN_WIDTH = 512,
  SCREEN_HEIGHT = 640;
const INK = "#263b30",
  PAPER = "#f3e5c9",
  FOREST = "#294b3c";
const buttons = {
  new: [188, 93, 140, 35],
  scores: [340, 93, 148, 35],
  back: [40, 548, 432, 40],
  confirm: [264, 371, 194, 44],
  cancel: [54, 371, 194, 44],
  continue: [94, 375, 324, 44],
} as const;
const demo = [2, 4, 0, 0, 16, 0, 2, 4, 64, 32, 8, 0, 128, 2, 0, 0];
const emptyBoard = Array<number>(16).fill(0);
export const ARCADE_CONTROLS_HINT = "Use WASD or mouse to move them";
export const arcadeDisplayBoard = (s: ArcadeScreenState) =>
  s.view?.game?.board ?? (s.active ? emptyBoard : demo);
export const arcadeGpuTilesVisible = (s: ArcadeScreenState) =>
  s.page === "board" &&
  (!s.active || !!s.view?.game) &&
  !s.error &&
  !(
    s.view?.game &&
    ((arcadeWon(s.view.game) && !s.view.game.continued) ||
      arcadeOver(s.view.game))
  );
const round = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 5,
) => {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
};
function fill(
  c: CanvasRenderingContext2D,
  rect: readonly number[],
  color: string,
  r = 5,
) {
  c.fillStyle = color;
  round(c, rect[0], rect[1], rect[2], rect[3], r);
  c.fill();
}
function text(
  c: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color = INK,
  align: CanvasTextAlign = "left",
  serif = false,
) {
  c.font = `${serif ? "400" : "700"} ${size}px "${serif ? "Bree Serif" : "Alegreya Sans"}"`;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.fillText(value, x, y);
}
function button(
  c: CanvasRenderingContext2D,
  rect: readonly number[],
  label: string,
  color = FOREST,
) {
  fill(c, rect, color);
  text(
    c,
    label,
    rect[0] + rect[2] / 2,
    rect[1] + rect[3] / 2,
    21,
    PAPER,
    "center",
  );
}
const tileColors: Record<number, [string, string]> = {
  2: ["#eee5cf", INK],
  4: ["#e2d3af", INK],
  8: ["#d99a43", "#fff5da"],
  16: ["#ca7546", "#fff5da"],
  32: ["#b8563d", "#fff5da"],
  64: ["#963e2f", "#fff5da"],
  128: ["#d9ad45", INK],
  256: ["#c89932", INK],
  512: ["#b78321", "#fff5da"],
  1024: ["#50704d", "#fff5da"],
  2048: ["#294b3c", "#fff5da"],
};
function tile(
  c: CanvasRenderingContext2D,
  value: number,
  index: number,
  scale = 1,
  xOverride?: number,
  yOverride?: number,
) {
  if (!value) return;
  const x = xOverride ?? 48 + (index % 4) * 106,
    y = yOverride ?? 162 + Math.floor(index / 4) * 106;
  const [bg, fg] = tileColors[value] ?? ["#244337", "#fff5da"];
  c.save();
  c.translate(x + 49, y + 49);
  c.scale(scale, scale);
  fill(c, [-49, -49, 98, 98], bg, 4);
  text(
    c,
    String(value),
    0,
    1,
    String(value).length <= 2
      ? 49
      : String(value).length <= 3
        ? 43
        : String(value).length <= 4
          ? 36
          : 27,
    fg,
    "center",
    true,
  );
  c.restore();
}
/** One cached face; the runtime atlas reuses exactly the Canvas renderer's art. */
export function drawArcadeTileFace(c: CanvasRenderingContext2D, value: number) {
  tile(c, value, 0, 1, 0, 0);
}
export function makeTileAnimation(
  before: ArcadeView | null,
  after: ArcadeView | null,
  direction: Parameters<typeof slideArcade>[1] | null,
  now: number,
): TileAnimation | null {
  if (
    !before?.game ||
    !after?.game ||
    !direction ||
    after.game.moves !== before.game.moves + 1
  )
    return null;
  const result = slideArcade(before.game.board, direction);
  // A stale-tab/error response may advance the board without accepting our direction.
  if (!result.changed || after.game.score !== before.game.score + result.gain)
    return null;
  const spawned: number[] = [];
  for (let i = 0; i < 16; i++) {
    if (result.board[i]) {
      if (after.game.board[i] !== result.board[i]) return null;
    } else if (after.game.board[i]) {
      if (after.game.board[i] !== 2 && after.game.board[i] !== 4) return null;
      spawned.push(i);
    }
  }
  if (spawned.length !== 1) return null;
  return {
    started: now,
    motions: result.motions,
    merged: [
      ...new Set(result.motions.filter((m) => m.merge).map((m) => m.to)),
    ],
    spawned,
    gain: result.gain,
  };
}
export function hitArcadeScreen(
  s: ArcadeScreenState,
  x: number,
  y: number,
): ScreenAction | null {
  const inside = (r: readonly number[]) =>
    x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
  if (s.active && x >= 380 && y >= 590 && x <= 488 && y <= 640) return "leave";
  if (s.pending) return null;
  if (inside(buttons.new)) return "new";
  if (inside(buttons.scores)) return "scores";
  if (s.page === "leaders") return inside(buttons.back) ? "back" : null;
  if (s.page === "confirm")
    return inside(buttons.confirm)
      ? "confirm"
      : inside(buttons.cancel)
        ? "back"
        : null;
  if (
    s.view?.game &&
    ((arcadeWon(s.view.game) && !s.view.game.continued) ||
      arcadeOver(s.view.game))
  )
    return inside(buttons.continue) ? "continue" : null;
  return inside(buttons.new) ? "new" : inside(buttons.scores) ? "scores" : null;
}
export function drawArcadeScreen(
  c: CanvasRenderingContext2D,
  s: ArcadeScreenState,
  animation: TileAnimation | null = null,
  now = 0,
  options: { omitTiles?: boolean } = {},
) {
  c.save();
  c.clearRect(0, 0, 512, 640);
  c.fillStyle = PAPER;
  c.fillRect(0, 0, 512, 640);
  fill(c, [24, 20, 144, 108], "#d3a341", 5);
  text(c, "2048", 96, 64, 51, INK, "center", true);
  text(c, "LA BARAJ", 96, 106, 13, INK, "center");
  for (const [label, value, x, w] of [
    ["SCORE", s.view?.game?.score ?? 0, 188, 140],
    ["BEST", s.view?.best ?? 0, 340, 148],
  ] as const) {
    fill(c, [x, 20, w, 63], FOREST);
    text(c, label, x + w / 2, 36, 14, "#d9d4b7", "center");
    text(c, String(value), x + w / 2, 62, 28, PAPER, "center", true);
  }
  button(c, buttons.new, "New game");
  button(c, buttons.scores, "Scores", "#a45135");
  fill(c, [40, 154, 432, 432], "#857c60", 6);
  for (let i = 0; i < 16; i++)
    fill(
      c,
      [48 + (i % 4) * 106, 162 + Math.floor(i / 4) * 106, 98, 98],
      "#aba38a",
      4,
    );
  const board = arcadeDisplayBoard(s);
  const elapsed = animation ? now - animation.started : Infinity,
    t = Math.min(1, Math.max(0, elapsed / ARCADE_TILE_MS));
  if (!options.omitTiles && animation && t < 0.72) {
    const move = t / 0.72,
      eased = 1 - (1 - move) ** 3;
    for (const m of animation.motions) {
      const x = 48 + ((m.from % 4) + ((m.to % 4) - (m.from % 4)) * eased) * 106,
        y =
          162 +
          (Math.floor(m.from / 4) +
            (Math.floor(m.to / 4) - Math.floor(m.from / 4)) * eased) *
            106;
      tile(c, m.value, m.to, 1, x, y);
    }
  } else if (!options.omitTiles)
    for (let i = 0; i < 16; i++)
      tile(
        c,
        board[i],
        i,
        animation && t < 1
          ? animation.spawned.includes(i)
            ? Math.max(0.1, (t - 0.72) / 0.28)
            : animation.merged.includes(i)
              ? 1 + 0.09 * Math.sin(((t - 0.72) / 0.28) * Math.PI)
              : 1
          : 1,
      );
  if (s.active) {
    text(c, ARCADE_CONTROLS_HINT, 40, 616, 16);
    button(c, [382, 600, 90, 32], "Leave");
  } else
    text(
      c,
      s.occupantName ? `Occupied · ${s.occupantName}` : "E or click to play",
      256,
      616,
      17,
      INK,
      "center",
    );
  if (s.page === "leaders") {
    fill(c, [24, 145, 464, 449], PAPER);
    text(
      c,
      s.local ? "Local records" : "Global leaderboard",
      256,
      174,
      31,
      INK,
      "center",
      true,
    );
    text(
      c,
      s.local
        ? "Practice scores stay in this preview."
        : "Best scores from every player.",
      256,
      206,
      19,
      INK,
      "center",
    );
    const leaders = s.view?.leaders ?? [];
    if (!leaders.length) {
      text(
        c,
        "The first record could be yours.",
        256,
        335,
        25,
        INK,
        "center",
        true,
      );
    }
    for (const [i, row] of leaders.entries()) {
      const y = 244 + i * 29;
      fill(c, [40, y - 13, 432, 27], i % 2 ? "#e6d7b9" : "#efe3c9", 2);
      text(c, String(row.rank), 57, y, 18, INK, "center");
      let name = row.name;
      while (name.length > 1 && c.measureText(name).width > 270)
        name = name.slice(0, -1);
      text(c, name !== row.name ? name.slice(0, -1) + "…" : name, 83, y, 20);
      text(
        c,
        row.score.toLocaleString("en-US"),
        455,
        y,
        20,
        INK,
        "right",
        true,
      );
    }
    button(c, buttons.back, "Back to game");
  }
  const won = s.view?.game && arcadeWon(s.view.game) && !s.view.game.continued;
  const over = s.view?.game && arcadeOver(s.view.game);
  if (s.page === "confirm" || (s.page === "board" && (won || over))) {
    c.fillStyle = "rgba(38,59,48,.72)";
    c.fillRect(40, 154, 432, 432);
    fill(c, [48, 249, 416, 187], PAPER, 8);
    text(
      c,
      s.page === "confirm"
        ? "Start a new game?"
        : won
          ? "2048. Beautiful."
          : "No moves left.",
      256,
      282,
      32,
      INK,
      "center",
      true,
    );
    text(
      c,
      s.page === "confirm"
        ? "Your best score stays saved."
        : won
          ? "Keep going for a higher record."
          : "Your best score is saved.",
      256,
      326,
      23,
      INK,
      "center",
    );
    text(
      c,
      s.page === "confirm"
        ? "Enter / Space starts · Esc keeps this game"
        : won
          ? "Enter / Space to keep going"
          : "Enter / Space for a new game",
      256,
      352,
      16,
      INK,
      "center",
    );
    if (s.page === "confirm") {
      button(c, buttons.cancel, "Keep this game", "#857c60");
      button(c, buttons.confirm, "Start fresh");
    } else button(c, buttons.continue, won ? "Keep going" : "New game");
  }
  if (s.error) {
    fill(c, [40, 445, 432, 137], "#294b3c");
    const words = s.error.split(" ");
    let line = "",
      y = 467;
    for (const word of words) {
      const next = line ? line + " " + word : word;
      c.font = '700 21px "Alegreya Sans"';
      if (c.measureText(next).width > 392 && line) {
        text(c, line, 60, y, 21, PAPER);
        line = word;
        y += 25;
      } else line = next;
    }
    text(c, line, 60, y, 21, PAPER);
  } else if (s.active && !s.view?.game)
    text(c, "Opening your game…", 256, 360, 27, INK, "center", true);
  if (s.focused) {
    c.strokeStyle = FOREST;
    c.lineWidth = 3;
    round(c, 8, 8, 496, 624, 7);
    c.stroke();
  }
  c.restore();
}
