import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  planeCells,
  isGridPoint,
  randomFleet,
  legalFleet,
  otherSide,
  coordinate,
  type Plane,
  type GridPoint,
  type Shot,
  type Side,
  type PlanesView,
  type PlanesAction,
} from "../../../packages/shared/planes";
import {
  draggedPlane,
  fleetWithPlane,
  rotateGrab,
  validPlacement,
} from "./plane-placement";
import "./planes.css";

export type PlanesBoardProps = {
  view: PlanesView | null;
  connected: boolean;
  open?: boolean;
  onAction: (action: PlanesAction, revision: number) => Promise<string | null>;
  onClose: () => void;
  onLeave: () => void;
};
function cellPlane(planes: readonly Plane[], x: number, y: number) {
  return planes.findIndex((p) =>
    planeCells(p).some((c) => c.x === x && c.y === y),
  );
}
function outline(plane: Plane) {
  const cells = planeCells(plane),
    keys = new Set(cells.map((p) => `${p.x}:${p.y}`));
  return cells
    .flatMap(({ x, y }) => [
      !keys.has(`${x}:${y - 1}`) ? `M${x} ${y}h1` : "",
      !keys.has(`${x + 1}:${y}`) ? `M${x + 1} ${y}v1` : "",
      !keys.has(`${x}:${y + 1}`) ? `M${x} ${y + 1}h1` : "",
      !keys.has(`${x - 1}:${y}`) ? `M${x} ${y}v1` : "",
    ])
    .join(" ");
}
function PaperGrid({
  planes = [],
  shots,
  onCell,
  selected = -1,
  active = false,
  label,
  small = false,
  dragPreview,
  onPlanePointerDown,
  onPlanePointerMove,
  onPlanePointerUp,
  onPlanePointerCancel,
  suppressClick,
}: {
  planes?: readonly Plane[];
  shots: readonly Shot[];
  onCell?: (point: GridPoint) => void;
  selected?: number;
  active?: boolean;
  label: string;
  small?: boolean;
  dragPreview?: { plane: Plane; index: number; valid: boolean } | null;
  onPlanePointerDown?: (
    event: PointerEvent<HTMLDivElement>,
    point: GridPoint,
  ) => void;
  onPlanePointerMove?: (event: PointerEvent<HTMLDivElement>) => void;
  onPlanePointerUp?: (event: PointerEvent<HTMLDivElement>) => void;
  onPlanePointerCancel?: () => void;
  suppressClick?: () => boolean;
}) {
  const last = shots.at(-1);
  const key = (x: number, y: number) => `${x}:${y}`;
  const planesByCell = new Map<string, number>();
  planes.forEach((plane, index) =>
    planeCells(plane).forEach(({ x, y }) => planesByCell.set(key(x, y), index)),
  );
  const shotsByCell = new Map(shots.map((shot) => [key(shot.x, shot.y), shot]));
  const downedCells = new Set(
    shots.flatMap((shot) =>
      shot.revealed
        ? planeCells(shot.revealed).map(({ x, y }) => key(x, y))
        : [],
    ),
  );
  const previewCells = new Set(
    dragPreview
      ? planeCells(dragPreview.plane).map(({ x, y }) => key(x, y))
      : [],
  );
  return (
    <div
      className={`paper-grid${small ? " paper-grid--small" : ""}${onPlanePointerDown ? " paper-grid--editable" : ""}`}
      role="group"
      aria-label={label}
      data-drop-valid={dragPreview ? String(dragPreview.valid) : undefined}
      onPointerDown={(event) => {
        const cell = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-grid-cell]",
        );
        if (cell && onPlanePointerDown)
          onPlanePointerDown(event, {
            x: Number(cell.dataset.x),
            y: Number(cell.dataset.y),
          });
      }}
      onPointerMove={onPlanePointerMove}
      onPointerUp={onPlanePointerUp}
      onPointerCancel={onPlanePointerCancel}
      onLostPointerCapture={onPlanePointerCancel}
      onClickCapture={(event) => {
        if (suppressClick?.()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <span className="paper-axis-corner" aria-hidden="true" />
      {Array.from({ length: 10 }, (_, x) => (
        <span className="paper-axis" key={`col${x}`} aria-hidden="true">
          {String.fromCharCode(65 + x)}
        </span>
      ))}
      {Array.from({ length: 10 }, (_, y) => (
        <div className="paper-grid-row" key={y}>
          <span className="paper-axis" aria-hidden="true">
            {y + 1}
          </span>
          {Array.from({ length: 10 }, (_, x) => {
            const index = planesByCell.get(key(x, y)) ?? -1,
              plane = index < 0 ? null : planes[index];
            const shot = shotsByCell.get(key(x, y));
            const downed = downedCells.has(key(x, y));
            const blocked = !planes.length && Boolean(shot || downed);
            const status =
              shot?.result ??
              (downed
                ? "downed"
                : plane
                  ? plane.x === x && plane.y === y
                    ? "cockpit"
                    : "plane"
                  : "empty");
            const classes = [
              "paper-cell",
              `paper-cell--${status}`,
              index === selected && plane ? "paper-cell--selected" : "",
              dragPreview && index === dragPreview.index
                ? "paper-cell--drag-source"
                : "",
              dragPreview && previewCells.has(key(x, y))
                ? `paper-cell--preview-${dragPreview.valid ? "valid" : "invalid"}`
                : "",
              dragPreview?.plane.x === x && dragPreview?.plane.y === y
                ? "paper-cell--preview-cockpit"
                : "",
              last?.x === x && last?.y === y ? "paper-cell--last" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const description = `${coordinate({ x, y })}${status !== "empty" ? ` · ${status}` : ""}`;
            return onCell ? (
              <button
                type="button"
                className={classes}
                key={x}
                data-grid-cell=""
                data-x={x}
                data-y={y}
                aria-label={description}
                disabled={!active || blocked}
                onClick={() => onCell({ x, y })}
              />
            ) : (
              <span
                className={classes}
                key={x}
                role="img"
                aria-label={description}
              />
            );
          })}
        </div>
      ))}
      <svg
        className="paper-plane-outlines"
        viewBox="0 0 10 10"
        aria-hidden="true"
      >
        {planes.map((p, i) => (
          <path
            key={i}
            d={outline(p)}
            className={`${i === selected ? "paper-plane-outline--selected" : ""}${dragPreview?.index === i ? " paper-plane-outline--drag-source" : ""}`}
          />
        ))}
        {dragPreview && (
          <path
            d={outline(dragPreview.plane)}
            className={`paper-plane-outline--preview-${dragPreview.valid ? "valid" : "invalid"}`}
          />
        )}
        {shots
          .filter((s) => s.revealed)
          .map((s, i) => (
            <path
              className="paper-plane-outline--downed"
              key={`down${i}`}
              d={outline(s.revealed!)}
            />
          ))}
      </svg>
    </div>
  );
}
export default function PlanesBoard({
  view,
  connected,
  open = true,
  onAction,
  onClose,
  onLeave,
}: PlanesBoardProps) {
  const [draft, setDraft] = useState<Plane[]>(() => randomFleet());
  const [selected, setSelected] = useState(0),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [now, setNow] = useState(Date.now()),
    [rules, setRules] = useState(false);
  const [preview, setPreview] = useState<{
    plane: Plane;
    index: number;
    valid: boolean;
  } | null>(null);
  const drag = useRef<{
    pointerId: number;
    index: number;
    plane: Plane;
    grabbed: GridPoint;
    target: GridPoint;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const ignoreClick = useRef(false);
  const initialized = useRef<string>("");
  const paperRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) paperRef.current?.focus({ preventScroll: true });
  }, [open]);
  const you = view?.you ?? null,
    own = you === null ? null : view?.players[you],
    opponent = you === null ? null : view?.players[otherSide(you)];
  const phase = view?.phase ?? "lobby";
  const canPlace =
    you !== null &&
    ["lobby", "setup", "finished"].includes(phase) &&
    !own?.ready &&
    !pending &&
    connected;
  useEffect(() => {
    if (!canPlace || !open) {
      drag.current = null;
      setPreview(null);
    }
  }, [canPlace, open]);
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);
  useEffect(() => {
    const key = `${view?.round}:${you}:${phase === "finished" ? "next" : "current"}`;
    if (view?.ownPlanes && initialized.current !== key) {
      initialized.current = key;
      setDraft(
        phase === "finished"
          ? randomFleet()
          : view.ownPlanes.map((p) => ({ ...p })),
      );
      setSelected(0);
      setError("");
    }
  }, [view?.round, you, view?.ownPlanes, phase]);
  const act = async (action: PlanesAction) => {
    if (!view || pending) return;
    setPending(true);
    setError("");
    try {
      const failure = await onAction(action, view.revision);
      if (failure) setError(failure);
    } catch {
      setError("That move couldn't be sent. Try again.");
    } finally {
      setPending(false);
    }
  };
  const place = (point: GridPoint) => {
    if (!canPlace) return;
    const index = cellPlane(draft, point.x, point.y);
    if (index >= 0) {
      setSelected(index);
      setError("");
      return;
    }
    const next = draft.map((p, i) => (i === selected ? { ...p, ...point } : p));
    if (legalFleet(next)) {
      setDraft(next);
      setError("");
    } else setError("Keep the whole plane on the paper, clear of the others.");
  };
  const pointUnderPointer = (
    event: PointerEvent<HTMLDivElement>,
  ): GridPoint | null => {
    const first = event.currentTarget.querySelector<HTMLElement>(
      '[data-x="0"][data-y="0"]',
    );
    if (!first) return null;
    const cell = first.getBoundingClientRect();
    if (!cell.width || !cell.height) return null;
    return {
      x: Math.floor((event.clientX - cell.left) / cell.width),
      y: Math.floor((event.clientY - cell.top) / cell.height),
    };
  };
  const updateDragPreview = (current: NonNullable<typeof drag.current>) => {
    const plane = draggedPlane(current.plane, current.grabbed, current.target);
    setPreview({
      index: current.index,
      plane,
      valid: validPlacement(draft, current.index, plane),
    });
  };
  const pointerDown = (
    event: PointerEvent<HTMLDivElement>,
    point: GridPoint,
  ) => {
    if (!canPlace || event.button !== 0 || drag.current) return;
    const index = cellPlane(draft, point.x, point.y);
    if (index < 0) return;
    event.preventDefault();
    (event.target as HTMLElement).focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      index,
      plane: draft[index],
      grabbed: point,
      target: point,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    setSelected(index);
    setError("");
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (
      Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      ) >= 4
    )
      current.moved = true;
    const target = pointUnderPointer(event);
    if (target) current.target = target;
    if (current.moved) updateDragPreview(current);
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const target = pointUnderPointer(event);
    if (target) current.target = target;
    if (current.moved && canPlace) {
      const plane = draggedPlane(
        current.plane,
        current.grabbed,
        current.target,
      );
      if (validPlacement(draft, current.index, plane)) {
        setDraft(fleetWithPlane(draft, current.index, plane));
        setError("");
      } else {
        setError(
          planeCells(plane).some(({ x, y }) => !isGridPoint(x, y))
            ? "Keep the whole plane inside the grid."
            : "Planes can't overlap. Choose a clear spot.",
        );
      }
    }
    drag.current = null;
    setPreview(null);
    ignoreClick.current = true;
    window.setTimeout(() => {
      ignoreClick.current = false;
    }, 0);
  };
  const cancelDrag = () => {
    drag.current = null;
    setPreview(null);
  };
  const rotate = () => {
    if (!canPlace) return;
    if (drag.current) {
      drag.current.moved = true;
      drag.current.grabbed = rotateGrab(
        drag.current.plane,
        drag.current.grabbed,
      );
      drag.current.plane = {
        ...drag.current.plane,
        rotation: (drag.current.plane.rotation + 1) % 4,
      };
      updateDragPreview(drag.current);
      return;
    }
    const next = draft.map((p, i) =>
      i === selected ? { ...p, rotation: (p.rotation + 1) % 4 } : p,
    );
    if (legalFleet(next)) {
      setDraft(next);
      setError("");
    } else
      setError(
        "Move the plane to a clear spot to rotate it, or press R while dragging.",
      );
  };
  const turn = phase === "playing" && you !== null && view?.turn === you;
  const winner = phase === "finished" ? (view?.winner ?? null) : null;
  const away = view?.players.find((p) => p && !p.online);
  const seconds = (deadline: number | null | undefined) =>
    Math.max(
      0,
      Math.min(
        away ? 30 : phase === "playing" ? 60 : 120,
        Math.ceil(((deadline ?? now) - now) / 1000),
      ),
    );
  const status = !connected
    ? "Reconnecting to the table…"
    : phase === "finished"
      ? winner === null
        ? "Round over"
        : you === winner
          ? "You won."
          : you === null
            ? `${view?.players[winner]?.name ?? "The other player"} won.`
            : "Your opponent won."
      : away
        ? `${away.name} is reconnecting · ${seconds(away.awayUntil)}s`
        : phase === "playing"
          ? you === null
            ? `${view?.players[view.turn ?? 0]?.name}'s turn`
            : turn
              ? "Your turn. Pick a square."
              : `${opponent?.name ?? "Your opponent"} is thinking…`
          : !opponent && you !== null
            ? "Waiting for a friend in the opposite seat."
            : you === null
              ? phase === "lobby"
                ? "Take a seat to play. Or stay and watch."
                : "The players are placing their planes."
              : own?.ready
                ? "You're ready. Waiting for your opponent."
                : "Arrange your planes, then get ready.";
  const keyboard = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      if (drag.current) cancelDrag();
      else if (rules) setRules(false);
      else onClose();
    }
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (
      direction &&
      canPlace &&
      !rules &&
      !drag.current &&
      (event.target as HTMLElement).closest(
        ".paper-grid--editable, .planes-plane-picker",
      )
    ) {
      event.preventDefault();
      const plane = {
        ...draft[selected],
        x: draft[selected].x + direction[0],
        y: draft[selected].y + direction[1],
      };
      if (validPlacement(draft, selected, plane)) {
        setDraft(fleetWithPlane(draft, selected, plane));
        setError("");
      } else setError("Move to a clear square within the grid.");
    }
    if (event.key.toLowerCase() === "r" && canPlace) {
      event.preventDefault();
      rotate();
    }
  };
  const attackShots = you === null ? [] : (view?.shots[you] ?? []),
    incoming = you === null ? [] : (view?.shots[otherSide(you)] ?? []);
  const latest = attackShots.at(-1);
  return (
    <section
      ref={paperRef}
      hidden={!open}
      tabIndex={-1}
      className="planes-notebook"
      aria-label="Planes game"
      onKeyDown={keyboard}
      data-testid="planes-board"
      data-phase={phase}
      data-side={you ?? "spectator"}
    >
      <header className="planes-heading">
        <h2>Planes</h2>
        <div className="planes-heading-actions">
          <button
            type="button"
            className="planes-text-button"
            aria-expanded={rules}
            aria-controls="planes-guide"
            onClick={() => setRules(!rules)}
          >
            How to play
          </button>
          <button
            type="button"
            className="planes-text-button"
            onClick={onClose}
          >
            Fold <span aria-hidden="true">Esc</span>
          </button>
        </div>
      </header>
      <div className="planes-players" aria-label="Players">
        {([0, 1] as Side[]).map((side) => (
          <div
            key={side}
            className={
              side === view?.turn && phase === "playing"
                ? "planes-player planes-player--turn"
                : "planes-player"
            }
          >
            <strong>
              {view?.players[side]?.name ?? "Empty seat"}
              {you === side ? " (you)" : ""}
            </strong>
            <span>
              {!view?.players[side]
                ? "Sit opposite a friend"
                : !view.players[side]!.online
                  ? "Reconnecting"
                  : phase === "playing" || phase === "finished"
                    ? `${view.players[side]!.remaining} planes left`
                    : view.players[side]!.ready
                      ? "Ready"
                      : "Placing planes"}
            </span>
          </div>
        ))}
      </div>
      <div className="planes-status" role="status">
        <strong>{status}</strong>
        {(phase === "playing" || phase === "setup") &&
          !away &&
          view?.deadline && (
            <span
              className="planes-clock"
              aria-label={
                phase === "playing"
                  ? "Turn time remaining"
                  : "Placement time remaining"
              }
            >
              {seconds(view.deadline)}s
            </span>
          )}
      </div>
      {you === null ? (
        <div className="planes-spectator">
          {([0, 1] as Side[]).map((side) => (
            <div key={side}>
              <h3>{view?.players[side]?.name ?? "Player"}'s shots</h3>
              <PaperGrid
                shots={view?.shots[side] ?? []}
                label={`${view?.players[side]?.name ?? "Player"} public shots`}
              />
            </div>
          ))}
          <p>You're watching. Hidden planes stay private.</p>
        </div>
      ) : (
        <div
          className={`planes-play-area${phase === "playing" ? " planes-play-area--battle" : ""}`}
        >
          {phase === "playing" ? (
            <>
              <div className="planes-main-grid">
                <h3>{opponent?.name ?? "Opponent"}'s planes</h3>
                <PaperGrid
                  shots={attackShots}
                  onCell={(p) => void act({ kind: "shot", ...p })}
                  active={Boolean(turn && !away && !pending && connected)}
                  label="Opponent target grid"
                />
                <p className="planes-shot-note">
                  {latest
                    ? `${coordinate(latest)} · ${latest.result === "head" ? "Head hit. Plane down." : latest.result === "body" ? "Body hit. Find the cockpit." : "Miss."}`
                    : turn
                      ? "Choose a square to fire."
                      : ""}
                </p>
              </div>
              <div className="planes-fleet-mini">
                <h3>Your planes</h3>
                <PaperGrid
                  planes={view?.ownPlanes ?? []}
                  shots={incoming}
                  small
                  label="Your private fleet"
                />
              </div>
            </>
          ) : (
            <>
              <div className="planes-main-grid">
                <h3>Your planes</h3>
                <PaperGrid
                  planes={draft}
                  shots={[]}
                  onCell={canPlace ? place : undefined}
                  selected={canPlace ? selected : -1}
                  active={canPlace}
                  label="Your plane placement grid"
                  dragPreview={preview}
                  onPlanePointerDown={canPlace ? pointerDown : undefined}
                  onPlanePointerMove={pointerMove}
                  onPlanePointerUp={pointerUp}
                  onPlanePointerCancel={cancelDrag}
                  suppressClick={() => {
                    const ignore = ignoreClick.current;
                    ignoreClick.current = false;
                    return ignore;
                  }}
                />
              </div>
              <div className="planes-setup-tools">
                {phase === "finished" && (
                  <p>
                    {view?.reason === "fleet"
                      ? "Three cockpits found. Well played."
                      : view?.reason === "timeout"
                        ? "The turn timer ran out."
                        : view?.reason === "connection"
                          ? "The connection didn't return in time."
                          : "The other player left the table."}
                  </p>
                )}
                <p className="planes-placement-hint">
                  Drag to move. Press <kbd>R</kbd> to rotate, even while
                  dragging.
                </p>
                <p
                  className={`planes-drop-hint${preview ? (preview.valid ? " planes-drop-hint--valid" : " planes-drop-hint--invalid") : ""}`}
                  aria-live="polite"
                >
                  {preview
                    ? preview.valid
                      ? "Release to place"
                      : "Can't place here"
                    : "Green fits · red doesn't."}
                </p>
                <div className="planes-plane-picker">
                  {draft.map((_, i) => (
                    <button
                      type="button"
                      disabled={!canPlace}
                      aria-pressed={i === selected}
                      onClick={() => setSelected(i)}
                      key={i}
                    >
                      Plane {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="planes-secondary"
                  disabled={!canPlace}
                  onClick={rotate}
                >
                  Rotate <kbd>R</kbd>
                </button>
                <button
                  type="button"
                  className="planes-secondary"
                  disabled={!canPlace}
                  onClick={() => {
                    setDraft(randomFleet());
                    setError("");
                  }}
                >
                  Shuffle layout
                </button>
                <button
                  type="button"
                  className="planes-ready"
                  disabled={
                    !connected ||
                    pending ||
                    !opponent ||
                    Boolean(away) ||
                    Boolean(own?.ready)
                  }
                  onClick={() =>
                    void act({
                      kind: phase === "finished" ? "rematch" : "ready",
                      planes: draft,
                    })
                  }
                >
                  {pending
                    ? "Sending…"
                    : own?.ready
                      ? "Ready — waiting"
                      : phase === "finished"
                        ? "Rematch"
                        : "Ready to play"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <p className="planes-error" role="alert">
        {error}
      </p>
      <footer className="planes-footer">
        {you !== null && (
          <button
            type="button"
            className="planes-text-button planes-leave"
            onClick={onLeave}
          >
            {phase === "playing" ? "Leave match · forfeit" : "Stand up"}
          </button>
        )}
      </footer>
      {rules && (
        <aside
          className="planes-guide"
          id="planes-guide"
          aria-label="How to play Planes"
        >
          <div className="planes-guide-heading">
            <h3>How to play</h3>
            <button
              type="button"
              className="planes-text-button"
              onClick={() => setRules(false)}
            >
              Close
            </button>
          </div>
          <ol>
            <li>
              <strong>Arrange your planes.</strong> Drag them to clear squares.
              Press R to turn, even while dragging. You can also select a plane
              and move it with arrow keys.
            </li>
            <li>
              <strong>Take turns firing.</strong> Choose a square on your
              opponent's grid. A miss is a circle; a body hit is a cross.
            </li>
            <li>
              <strong>Find the cockpits.</strong> A cockpit hit takes down the
              whole plane. Find all three to win.
            </li>
          </ol>
          <p>
            Your planes stay hidden from your opponent. You have 60 seconds per
            turn.
          </p>
        </aside>
      )}
    </section>
  );
}
