import "./arcade2048.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ArcadeDirection } from "../../../packages/shared/arcade2048";
import type { useArcade2048 } from "./use-arcade2048";
import { useTouchDevice } from "./mobile-device";
import { useMobilePortrait } from "./mobile-viewport";
import {
  arcadePortraitSurface,
  arcadeTouchPoint,
} from "./mobile-arcade-surface";
import {
  ARCADE_TILE_MS,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  drawArcadeScreen,
  hitArcadeScreen,
  makeTileAnimation,
  type TileAnimation,
} from "./arcade2048-screen";
export function swipeDirection(dx: number, dy: number): ArcadeDirection | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return null;
  return Math.abs(dx) > Math.abs(dy)
    ? dx > 0
      ? "right"
      : "left"
    : dy > 0
      ? "down"
      : "up";
}
/** The cabinet's renderer and exact 120ms slide/merge/spawn timeline, with touch input. */
export function MobileArcade2048({
  controls,
  onExit,
}: {
  controls: ReturnType<typeof useArcade2048>;
  onExit: () => void;
}) {
  const touch = useTouchDevice();
  const surface = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const portrait = useMobilePortrait();
  const previous = useRef(controls.state.view);
  const animation = useRef<TileAnimation | null>(null);
  const press = useRef<{
    id: number;
    x: number;
    y: number;
    u: number;
    v: number;
  } | null>(null);
  const [reduced, setReduced] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setFontsReady(true);
    });
    return () => {
      live = false;
      query.removeEventListener("change", update);
    };
  }, []);
  useLayoutEffect(() => {
    const { state, direction } = controls;
    if (state.view?.game !== previous.current?.game)
      animation.current = reduced
        ? null
        : makeTileAnimation(
            previous.current,
            state.view,
            direction.current,
            performance.now(),
          );
    previous.current = state.view;
    if (reduced || !state.active || state.page !== "board")
      animation.current = null;
    const context = canvas.current?.getContext("2d");
    if (!touch || !state.active || !context) return;
    let frame = 0;
    const paint = (now: number) => {
      frame = 0;
      if (document.hidden) return;
      context.setTransform(2, 0, 0, 2, 0, 0);
      drawArcadeScreen(context, state, animation.current, now, { touch: true });
      if (animation.current && now - animation.current.started < ARCADE_TILE_MS)
        frame = requestAnimationFrame(paint);
      else animation.current = null;
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      press.current = null;
      if (!document.hidden) paint(performance.now());
    };
    paint(performance.now());
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      press.current = null;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [touch, controls.state, controls.direction, reduced, fontsReady]);
  useLayoutEffect(() => {
    const node = surface.current,
      board = canvas.current;
    if (!node || !board || !touch || !controls.state.active) return;
    const size = () => {
      press.current = null;
      const box = node.getBoundingClientRect(),
        css = getComputedStyle(node);
      const padding = [
        css.paddingTop,
        css.paddingRight,
        css.paddingBottom,
        css.paddingLeft,
      ].map((x) => parseFloat(x) || 0) as [number, number, number, number];
      const p = arcadePortraitSurface(box.width, box.height, padding);
      board.style.width = `${p.width}px`;
      board.style.height = `${p.height}px`;
      board.style.left = `${p.x}px`;
      board.style.top = `${p.y}px`;
      board.style.transform = "translate(-50%,-50%)";
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(node);
    window.addEventListener("resize", size);
    return () => {
      press.current = null;
      observer.disconnect();
      window.removeEventListener("resize", size);
    };
  }, [touch, controls.state.active, portrait]);
  if (!touch || !controls.state.active) return null;
  const point = (x: number, y: number) => {
    const r = canvas.current!.getBoundingClientRect();
    return arcadeTouchPoint(x, y, r);
  };
  return (
    <section
      ref={surface}
      className="mobile-arcade"
      aria-label="2048 touch game"
      onPointerDown={(e) => {
        if (press.current) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        press.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          ...point(e.clientX, e.clientY),
        };
      }}
      onPointerUp={(e) => {
        const start = press.current;
        if (start?.id !== e.pointerId) return;
        press.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
        const dx = e.clientX - start.x,
          dy = e.clientY - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= 24) {
          if (
            controls.state.page === "board" &&
            start.u >= 40 &&
            start.u <= 472 &&
            start.v >= 154 &&
            start.v <= 586
          ) {
            const d = swipeDirection(dx, dy);
            if (d) controls.move(d);
          }
          return;
        }
        const p = point(e.clientX, e.clientY);
        // Shared hit regions gain a 44px touch height at the current surface scale.
        const bounds = canvas.current!.getBoundingClientRect();
        const physicalHeight = bounds.height;
        const action = hitArcadeScreen(
          controls.state,
          p.u,
          p.v,
          (44 * SCREEN_HEIGHT) / physicalHeight,
        );
        if (action === "leave") onExit();
        else if (action) controls.action(action);
      }}
      onPointerCancel={(e) => {
        if (press.current?.id === e.pointerId) press.current = null;
      }}
      onLostPointerCapture={(e) => {
        if (press.current?.id === e.pointerId) press.current = null;
      }}
    >
      <canvas
        ref={canvas}
        className="mobile-arcade-board"
        width={SCREEN_WIDTH * 2}
        height={SCREEN_HEIGHT * 2}
        role="group"
        aria-label={`2048 board. Score ${controls.state.view?.game?.score ?? 0}. Swipe to move tiles.`}
      />
      {controls.state.error && (
        <p className="arcade-assistive" role="alert">
          {controls.state.error}
        </p>
      )}
      <button className="arcade-assistive" onClick={onExit}>
        Leave 2048
      </button>
    </section>
  );
}
