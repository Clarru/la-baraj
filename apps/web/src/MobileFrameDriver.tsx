import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  createMobileFrameClock,
  MOBILE_STEP_SECONDS,
  mobilePixelRatio,
} from "./mobile-frame-clock";

/** Mounted only for touch play. Transport and board UI keep their own clocks. */
export function MobileFrameDriver({
  covered,
  onPixelRatio,
}: {
  covered: boolean;
  onPixelRatio: (ratio: number) => void;
}) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const clock = useMemo(createMobileFrameClock, []);
  const simulationTime = useRef(0);
  const work = useRef({ updates: 0, draws: 0, reportedAt: 0 });
  // A positive priority prevents R3F from drawing on every simulation step.
  useFrame(() => {}, 1);
  useEffect(() => {
    onPixelRatio(mobilePixelRatio(size.width, size.height));
  }, [onPixelRatio, size.width, size.height]);
  useEffect(() => {
    let frame = 0,
      disposed = false;
    // Let seat/arcade alignment settle before suspending the hidden world.
    const settleUntil = covered ? performance.now() + 1100 : Infinity;
    const report = (now: number, stopped = false) => {
      if (
        import.meta.env.DEV ||
        import.meta.env.VITE_GAME_DIAGNOSTICS === "1"
      ) {
        if (!stopped && now - work.current.reportedAt < 500) return;
        work.current.reportedAt = now;
        const canvas = get().gl.domElement;
        canvas.setAttribute(
          "data-mobile-frame-work",
          JSON.stringify({
            updates: work.current.updates,
            draws: work.current.draws,
            simulationTime: simulationTime.current,
            covered,
            stopped,
            width: canvas.width,
            height: canvas.height,
          }),
        );
      }
    };
    const tick = (now: number) => {
      frame = 0;
      if (disposed || document.hidden || now >= settleUntil) {
        clock.reset();
        report(now, true);
        return;
      }
      const { steps, draw } = clock.next(now);
      const state = get();
      for (let i = 0; i < steps; i++) {
        simulationTime.current += MOBILE_STEP_SECONDS;
        state.advance(simulationTime.current, true);
        work.current.updates++;
      }
      if (draw) {
        state.gl.render(state.scene, state.camera);
        work.current.draws++;
      }
      report(now);
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      clock.reset();
      if (!document.hidden && performance.now() < settleUntil)
        frame = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", visibility);
    clock.reset();
    if (!document.hidden) frame = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clock.reset();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [covered, get, clock]);
  return null;
}
