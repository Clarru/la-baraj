/** Test-only observation of the text actually painted into each physical screen's canvas. */
export * from "../../apps/web/src/arcade2048-screen";
import { drawArcadeScreen as drawScreen } from "../../apps/web/src/arcade2048-screen";
export const screenPaints = new WeakMap<HTMLCanvasElement, string[]>();
export function drawArcadeScreen(...args: Parameters<typeof drawScreen>) {
  const c = args[0],
    original = c.fillText,
    words: string[] = [];
  c.fillText = function (value, x, y, maxWidth) {
    words.push(String(value));
    if (maxWidth === undefined) original.call(this, value, x, y);
    else original.call(this, value, x, y, maxWidth);
  };
  try {
    return drawScreen(...args);
  } finally {
    c.fillText = original;
    screenPaints.set(c.canvas, words);
  }
}
