import { SCREEN_WIDTH, SCREEN_HEIGHT } from "./arcade2048-screen";
/** A portrait cabinet surface in either a natural portrait or cached landscape web view. */
export type ArcadeQuarterTurn = 0 | 90 | -90;
export function arcadePortraitTurn(
  portrait: boolean,
  type?: string,
  angle?: number,
): ArcadeQuarterTurn {
  if (portrait) return 0;
  const a = typeof angle === "number" ? ((angle % 360) + 360) % 360 : null;
  if (a === 90) return 90;
  if (a === 270) return -90;
  return type === "landscape-primary" ? 90 : -90;
}
export function arcadePortraitSurface(
  width: number,
  height: number,
  safe: readonly [number, number, number, number],
  turn: ArcadeQuarterTurn,
) {
  const [top, right, bottom, left] = safe;
  const w = Math.max(0, width - left - right),
    h = Math.max(0, height - top - bottom);
  const logicalWidth = turn ? h : w,
    logicalHeight = turn ? w : h;
  const surfaceWidth = Math.min(
    SCREEN_WIDTH,
    logicalWidth,
    (logicalHeight * SCREEN_WIDTH) / SCREEN_HEIGHT,
  );
  return {
    width: surfaceWidth,
    height: (surfaceWidth * SCREEN_HEIGHT) / SCREEN_WIDTH,
    x: left + w / 2,
    y: top + h / 2,
  };
}
export function arcadeTouchPoint(
  x: number,
  y: number,
  r: { left: number; top: number; width: number; height: number },
  turn: ArcadeQuarterTurn,
) {
  const px = (x - r.left) / r.width,
    py = (y - r.top) / r.height;
  return turn === 90
    ? { u: py * SCREEN_WIDTH, v: (1 - px) * SCREEN_HEIGHT }
    : turn === -90
      ? { u: (1 - py) * SCREEN_WIDTH, v: px * SCREEN_HEIGHT }
      : { u: px * SCREEN_WIDTH, v: py * SCREEN_HEIGHT };
}
export function arcadeTouchDelta(
  dx: number,
  dy: number,
  turn: ArcadeQuarterTurn,
) {
  return turn === 90
    ? { x: dy, y: -dx }
    : turn === -90
      ? { x: -dy, y: dx }
      : { x: dx, y: dy };
}
