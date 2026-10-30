import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  otherSide,
  type PlanesView,
  type Shot,
  type Side,
} from "../../../packages/shared/planes";

export const SHOT_DURATION = 720;
export const REDUCED_SHOT_DURATION = 180;
export type PresentedShot = {
  id: number;
  round: number;
  you: Side;
  incoming: boolean;
  shot: Shot;
};

/** Animate one newly accepted shot, never a joined/resumed history snapshot. */
export function newPresentedShot(
  previous: PlanesView | null,
  next: PlanesView | null,
): PresentedShot | null {
  if (
    !previous ||
    !next ||
    previous.phase !== "playing" ||
    !["playing", "finished"].includes(next.phase) ||
    next.you === null ||
    previous.you !== next.you ||
    previous.round !== next.round ||
    !next.event ||
    next.event.id === previous.event?.id ||
    (next.phase === "finished" && next.reason !== "fleet")
  )
    return null;
  const changes = next.shots.map(
    (shots, side) => shots.length - previous.shots[side].length,
  );
  const side =
    changes[0] === 1 && changes[1] === 0
      ? 0
      : changes[1] === 1 && changes[0] === 0
        ? 1
        : null;
  if (side === null || previous.turn !== side) return null;
  const shot = next.shots[side].at(-1)!;
  if (shot.result !== next.event.result) return null;
  return {
    id: next.event.id,
    round: next.round,
    you: next.you,
    incoming: side === otherSide(next.you),
    shot,
  };
}

export function usePresentedShot(
  view: PlanesView | null,
  connected: boolean,
  open: boolean,
) {
  const previous = useRef(view);
  const wasVisible = useRef(connected && open);
  const [active, setActive] = useState<PresentedShot | null>(null);
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const visible = connected && open;
  const candidate =
    visible && wasVisible.current
      ? newPresentedShot(previous.current, view)
      : null;
  const sameContext =
    active?.round === view?.round &&
    active?.you === view?.you &&
    (view?.phase === "playing" ||
      (view?.phase === "finished" && view.reason === "fleet"));
  const presentation = visible
    ? (candidate ?? (sameContext ? active : null))
    : null;
  useLayoutEffect(() => {
    previous.current = view;
    wasVisible.current = visible;
    if (!visible || !sameContext) setActive(candidate);
    else if (candidate) setActive(candidate);
  }, [view, visible]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!active) return;
    const timeout = setTimeout(
      () => setActive(null),
      reduced ? REDUCED_SHOT_DURATION : SHOT_DURATION,
    );
    return () => clearTimeout(timeout);
  }, [active, reduced]);
  return presentation;
}

type Geometry = {
  width: number;
  height: number;
  path: string;
  x: number;
  y: number;
  radius: number;
};
export function PlanesShot({
  presentation,
  area,
}: {
  presentation: PresentedShot;
  area: RefObject<HTMLDivElement | null>;
}) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  useLayoutEffect(() => {
    const root = area.current;
    if (!root) return;
    const measure = () => {
      const targetSheet = presentation.incoming
        ? ".planes-own-grid"
        : ".planes-main-grid";
      const sourceSheet = presentation.incoming
        ? ".planes-main-grid"
        : ".planes-own-grid";
      const target = root.querySelector<HTMLElement>(
        `${targetSheet} [data-x="${presentation.shot.x}"][data-y="${presentation.shot.y}"]`,
      );
      const source = root.querySelector<HTMLElement>(`${sourceSheet} h3`);
      if (!target || !source) return;
      const box = root.getBoundingClientRect(),
        end = target.getBoundingClientRect(),
        start = source.getBoundingClientRect();
      const x = end.left - box.left + end.width / 2,
        y = end.top - box.top + end.height / 2;
      const sx = start.left - box.left + start.width / 2,
        sy = start.bottom - box.top + 5;
      setGeometry({
        width: box.width,
        height: box.height,
        x,
        y,
        radius: Math.max(8, end.width * 0.65),
        path: `M${sx},${sy} C${sx},${sy - 36} ${x},${Math.max(0, y - 70)} ${x},${y}`,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [area, presentation]);
  if (!geometry) return null;
  const { width, height, path, x, y, radius } = geometry;
  return (
    <svg
      className={`planes-shot planes-shot--${presentation.shot.result}`}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <path className="planes-shot-trail" d={path} pathLength="1" />
      <path className="planes-shot-core" d={path} pathLength="1" />
      <g transform={`translate(${x} ${y})`}>
        <circle className="planes-shot-impact" r={radius} />
        <circle className="planes-shot-contact" r="3" />
        {presentation.shot.result !== "miss" && (
          <g className="planes-shot-sparks">
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <path
                key={angle}
                transform={`rotate(${angle})`}
                d={`M0 ${-radius * 0.7}v${-radius * 0.4}`}
              />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}
