import { SCREEN_WIDTH, SCREEN_HEIGHT } from "./arcade2048-screen";
/** Fit the shared portrait cabinet inside measured safe bounds. */
export function arcadePortraitSurface(
  width: number,
  height: number,
  safe: readonly [number, number, number, number],
) {
  const [top, right, bottom, left] = safe;
  const w = Math.max(0, width - left - right),
    h = Math.max(0, height - top - bottom);
  const surfaceWidth = Math.min(
    SCREEN_WIDTH,
    w,
    (h * SCREEN_WIDTH) / SCREEN_HEIGHT,
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
) {
  const px = (x - r.left) / r.width,
    py = (y - r.top) / r.height;
  return { u: px * SCREEN_WIDTH, v: py * SCREEN_HEIGHT };
}
