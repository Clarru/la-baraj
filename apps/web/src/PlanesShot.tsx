import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type CSSProperties,
} from "react";
import {
  otherSide,
  type PlanesView,
  type Shot,
  type Side,
} from "../../../packages/shared/planes";

export const SHOT_DURATION = 1200;
export const COCKPIT_SHOT_DURATION = 1850;
export const REDUCED_SHOT_DURATION = 180;
export type PresentedShot = {
  id: string;
  round: number;
  you: Side;
  side: Side;
  index: number;
  incoming: boolean;
  shot: Shot;
};
export function shotDuration(shot: Shot, reduced = false) {
  return reduced
    ? REDUCED_SHOT_DURATION
    : shot.result === "head"
      ? COCKPIT_SHOT_DURATION
      : SHOT_DURATION;
}

/** Recover the alternating order even when React receives several accepted shots together. */
export function newPresentedShots(
  previous: PlanesView | null,
  next: PlanesView | null,
): PresentedShot[] {
  if (
    !previous ||
    !next ||
    previous.phase !== "playing" ||
    !["playing", "finished"].includes(next.phase) ||
    next.you === null ||
    previous.you !== next.you ||
    previous.round !== next.round ||
    previous.turn === null ||
    !next.event ||
    next.event.id === previous.event?.id ||
    (next.phase === "finished" && next.reason !== "fleet")
  )
    return [];
  const positions = previous.shots.map((shots) => shots.length);
  if (positions.some((length, side) => next.shots[side].length < length))
    return [];
  const added: PresentedShot[] = [];
  let side: Side = previous.turn;
  while (positions.some((length, side) => length < next.shots[side].length)) {
    const index = positions[side]++;
    const shot = next.shots[side][index];
    if (!shot) return []; // Not a legal alternating extension of the observed match.
    added.push({
      id: `${side}:${index}`,
      round: next.round,
      you: next.you,
      side,
      index,
      incoming: side === otherSide(next.you),
      shot,
    });
    side = otherSide(side);
  }
  return added.at(-1)?.shot.result === next.event.result ? added : [];
}

export function usePresentedShot(
  view: PlanesView | null,
  connected: boolean,
  open: boolean,
) {
  const previous = useRef(view);
  const wasVisible = useRef(connected && open);
  const [items, setItems] = useState<PresentedShot[]>([]);
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const visible = connected && open;
  const added =
    visible && wasVisible.current
      ? newPresentedShots(previous.current, view)
      : [];
  const sameContext =
    items[0]?.round === view?.round &&
    items[0]?.you === view?.you &&
    (view?.phase === "playing" ||
      (view?.phase === "finished" && view.reason === "fleet"));
  const queue = visible ? [...(sameContext ? items : []), ...added] : [];
  const active = items[0];
  useLayoutEffect(() => {
    previous.current = view;
    wasVisible.current = visible;
    if (!visible || !sameContext) setItems(added);
    else if (added.length) setItems((current) => [...current, ...added]);
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
      () =>
        setItems((current) =>
          current[0] === active ? current.slice(1) : current,
        ),
      shotDuration(active.shot, reduced),
    );
    return () => clearTimeout(timeout);
  }, [active, reduced]);
  return { presentation: queue[0] ?? null, waiting: queue.slice(1) };
}

export const ROUND_RESULT_DURATION = 3000;
export function useRoundResult(
  view: PlanesView | null,
  connected: boolean,
  open: boolean,
  presenting: boolean,
) {
  const key =
    view?.phase === "finished" && view.winner !== null
      ? `${view.round}:${view.winner}:${view.reason}`
      : null;
  // Opening an already finished match does not replay a historical victory.
  const acknowledged = useRef(key);
  const [active, setActive] = useState<{
    key: string;
    remaining: number;
  } | null>(null);
  const starting =
    key !== null &&
    connected &&
    open &&
    !presenting &&
    acknowledged.current !== key;
  useLayoutEffect(() => {
    if (!key) {
      acknowledged.current = null;
      setActive(null);
    } else if (!connected || !open) {
      acknowledged.current = key;
      setActive(null);
    } else if (!presenting && acknowledged.current !== key) {
      acknowledged.current = key;
      setActive({ key, remaining: 3 });
    }
  }, [key, connected, open, presenting]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(
      () =>
        setActive((current) =>
          current && current.remaining > 1
            ? { ...current, remaining: current.remaining - 1 }
            : null,
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [active?.key]);
  return connected && open && key
    ? active?.key === key
      ? active.remaining
      : starting
        ? 3
        : null
    : null;
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
      data-shot-id={presentation.id}
    >
      <path className="planes-shot-trail" d={path} pathLength="1" />
      <path className="planes-shot-core" d={path} pathLength="1" />
      <g transform={`translate(${x} ${y})`}>
        <circle className="planes-shot-impact" r={radius} />
        <circle className="planes-shot-contact" r="3" />
        {presentation.shot.result === "head" && (
          <g
            className="planes-shot-explosion"
            style={{ "--burst-distance": `${radius * 3}px` } as CSSProperties}
          >
            <circle className="planes-explosion-flash" r={radius * 1.1} />
            <circle className="planes-explosion-ring" r={radius} />
            <circle
              className="planes-explosion-ring planes-explosion-ring--late"
              r={radius * 0.7}
            />
            {Array.from({ length: 12 }, (_, i) => (
              <g key={i} transform={`rotate(${i * 30})`}>
                <path
                  className={`planes-explosion-debris planes-explosion-debris--${i % 3}`}
                  d={`M-1 ${-radius * 0.5}l2 -${radius * 0.35}`}
                />
              </g>
            ))}
          </g>
        )}
        {presentation.shot.result === "body" && (
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
