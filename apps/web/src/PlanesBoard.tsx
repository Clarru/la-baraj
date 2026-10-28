import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  planeCells,
  randomFleet,
  legalFleet,
  otherSide,
  targetUnavailable,
  coordinate,
  type Plane,
  type GridPoint,
  type Shot,
  type Side,
  type PlanesView,
  type PlanesAction,
} from "../../../packages/shared/planes";
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
}: {
  planes?: readonly Plane[];
  shots: readonly Shot[];
  onCell?: (point: GridPoint) => void;
  selected?: number;
  active?: boolean;
  label: string;
  small?: boolean;
}) {
  const last = shots.at(-1);
  return (
    <div
      className={`paper-grid${small ? " paper-grid--small" : ""}`}
      role="group"
      aria-label={label}
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
            const index = cellPlane(planes, x, y),
              plane = index < 0 ? null : planes[index];
            const shot = shots.find((s) => s.x === x && s.y === y);
            const downed = shots.find(
              (s) =>
                s.revealed &&
                planeCells(s.revealed).some((c) => c.x === x && c.y === y),
            );
            const blocked = !planes.length && targetUnavailable(x, y, shots);
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
            className={i === selected ? "paper-plane-outline--selected" : ""}
          />
        ))}
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
  const rotate = () => {
    if (!canPlace) return;
    const next = draft.map((p, i) =>
      i === selected ? { ...p, rotation: (p.rotation + 1) % 4 } : p,
    );
    if (legalFleet(next)) {
      setDraft(next);
      setError("");
    } else setError("Not enough room to turn this plane. Move it first.");
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
                : "Three planes. Keep their cockpits hidden.";
  const keyboard = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
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
        <div>
          <h2>Planes</h2>
          <span>Avioane, on squared paper.</span>
        </div>
        <button type="button" className="planes-text-button" onClick={onClose}>
          Fold paper <span aria-hidden="true">Esc</span>
        </button>
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
                <h3>{opponent?.name ?? "Opponent"}'s sky</h3>
                <PaperGrid
                  shots={attackShots}
                  onCell={(p) => void act({ kind: "shot", ...p })}
                  active={Boolean(turn && !away && !pending && connected)}
                  label="Opponent target grid"
                />
                <p className="planes-shot-note">
                  {latest
                    ? `${coordinate(latest)} · ${latest.result === "head" ? "Head hit. Plane down." : latest.result === "body" ? "Body hit. Find the cockpit." : "Miss."}`
                    : "Your first clue is out there."}
                </p>
              </div>
              <div className="planes-fleet-mini">
                <h3>Your sky</h3>
                <PaperGrid
                  planes={view?.ownPlanes ?? []}
                  shots={incoming}
                  small
                  label="Your private fleet"
                />
                <p>Your planes are visible only to you.</p>
              </div>
            </>
          ) : (
            <>
              <div className="planes-main-grid">
                <h3>
                  {phase === "finished"
                    ? "A fresh layout for the next round"
                    : "Your sky"}
                </h3>
                <PaperGrid
                  planes={draft}
                  shots={[]}
                  onCell={canPlace ? place : undefined}
                  selected={canPlace ? selected : -1}
                  active={canPlace}
                  label="Your plane placement grid"
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
                <p>
                  Select a plane, then a square to move its cockpit. Turn it
                  with <kbd>R</kbd>.
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
                  Rotate plane
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
      {error && (
        <p className="planes-error" role="alert">
          {error}
        </p>
      )}
      <footer className="planes-footer">
        <button
          type="button"
          className="planes-text-button"
          aria-expanded={rules}
          onClick={() => setRules(!rules)}
        >
          How to play
        </button>
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
        <p className="planes-rules">
          Hide three planes on the 10 × 10 grid. Take turns calling squares. A
          body hit is a clue; a cockpit hit downs the entire plane. Find all
          three cockpits to win. Destroyed planes are revealed. Each turn allows
          60 seconds; a lost connection holds your place for 30 seconds.
        </p>
      )}
    </section>
  );
}
