/** Keep the 60 Hz controller/physics contract separate from a 30 Hz mobile draw budget. */
export const MOBILE_STEP_SECONDS = 1 / 60;
const STEP_MS = 1000 / 60,
  DRAW_MS = 1000 / 30;
export function createMobileFrameClock() {
  let previous: number | null = null,
    accumulated = 0,
    sinceDraw = 0;
  return {
    reset() {
      previous = null;
      accumulated = sinceDraw = 0;
    },
    next(now: number) {
      if (previous === null) {
        previous = now;
        return { steps: 1, draw: true };
      }
      // Drop a long background/stall gap instead of replaying a physics backlog.
      const elapsed = Math.min(50, Math.max(0, now - previous));
      previous = now;
      accumulated += elapsed;
      sinceDraw += elapsed;
      const steps = Math.min(3, Math.floor((accumulated + 0.001) / STEP_MS));
      accumulated = Math.max(0, accumulated - steps * STEP_MS);
      const draw = steps > 0 && sinceDraw + 0.001 >= DRAW_MS;
      if (draw) sinceDraw = Math.max(0, sinceDraw - DRAW_MS);
      return { steps, draw };
    },
  };
}
export function mobilePixelRatio(width: number, height: number) {
  return Math.min(1.25, Math.sqrt(520000 / Math.max(1, width * height)));
}
