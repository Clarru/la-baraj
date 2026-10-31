import { useRef, type CSSProperties } from "react";
import { X } from "lucide-react";
import {
  arcadeOver,
  arcadeWon,
  type ArcadeDirection,
} from "../../../packages/shared/arcade2048";
import type { useArcade2048 } from "./use-arcade2048";
import { useTouchDevice } from "./mobile-device";
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
export function MobileArcade2048({
  controls,
  onExit,
}: {
  controls: ReturnType<typeof useArcade2048>;
  onExit: () => void;
}) {
  const touch = useTouchDevice();
  const press = useRef<{ id: number; x: number; y: number } | null>(null);
  if (!touch || !controls.state.active) return null;
  const { state, action, move } = controls;
  const game = state.view?.game;
  const won = !!game && arcadeWon(game) && !game.continued;
  const over = !!game && arcadeOver(game);
  return (
    <section className="mobile-arcade" aria-label="2048 touch game">
      <header>
        <h1>2048</h1>
        <button aria-label="Leave cabinet" onClick={onExit}>
          <X size={23} /> Leave
        </button>
      </header>
      <div className="mobile-arcade-scroll">
        <p className="mobile-arcade-score">
          Score <strong>{game?.score ?? 0}</strong>
          <span>
            Best <strong>{state.view?.best ?? 0}</strong>
          </span>
        </p>
        {state.page === "board" && (
          <>
            <p className="mobile-arcade-hint">
              Swipe the board to merge tiles.
            </p>
            <div
              className="mobile-arcade-board"
              role="group"
              aria-label="2048 board. Swipe to move tiles."
              onPointerDown={(e) => {
                if (press.current || !game || state.pending) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                press.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
              }}
              onPointerUp={(e) => {
                const start = press.current;
                if (start?.id !== e.pointerId) return;
                press.current = null;
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
                const direction = swipeDirection(
                  e.clientX - start.x,
                  e.clientY - start.y,
                );
                if (direction) move(direction);
              }}
              onPointerCancel={() => {
                press.current = null;
              }}
              onLostPointerCapture={() => {
                press.current = null;
              }}
            >
              {Array.from({ length: 16 }, (_, i) => {
                const value = game?.board[i] ?? 0;
                const digits = Math.max(4, String(value).length);
                return (
                  <div
                    key={i}
                    className="mobile-tile"
                    data-value={value}
                    style={
                      {
                        "--tile-digits": digits,
                        fontSize: `min(42px, ${40 / digits}cqw)`,
                      } as CSSProperties
                    }
                    aria-label={`Row ${Math.floor(i / 4) + 1}, column ${(i % 4) + 1}: ${value || "empty"}`}
                  >
                    {value || ""}
                  </div>
                );
              })}
            </div>
            {(won || over) && (
              <div className="mobile-arcade-result">
                <h2>{won ? "You reached 2048!" : "No more moves"}</h2>
                <button
                  disabled={state.pending}
                  onClick={() => action("continue")}
                >
                  {won ? "Keep going" : "New game"}
                </button>
              </div>
            )}
            {!game && !state.error && (
              <p role="status">Loading your saved game…</p>
            )}
            <nav>
              <button disabled={state.pending} onClick={() => action("new")}>
                New game
              </button>
              <button disabled={state.pending} onClick={() => action("scores")}>
                {state.local ? "Local records" : "Global records"}
              </button>
            </nav>
          </>
        )}
        {state.page === "confirm" && (
          <div className="mobile-arcade-result">
            <h2>Start a new game?</h2>
            <p>Your current board will be replaced.</p>
            <button disabled={state.pending} onClick={() => action("confirm")}>
              Start fresh
            </button>
            <button disabled={state.pending} onClick={() => action("back")}>
              Keep this game
            </button>
          </div>
        )}
        {state.page === "leaders" && (
          <>
            <h2>{state.local ? "Local records" : "Global records"}</h2>
            {state.view?.leaders.length ? (
              <ol>
                {state.view.leaders.map((row) => (
                  <li key={row.rank}>
                    {row.name}
                    <strong>{row.score}</strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No records yet. Play a round to set one.</p>
            )}
            <button disabled={state.pending} onClick={() => action("back")}>
              Back to game
            </button>
          </>
        )}
        <p role="status" className="mobile-arcade-status">
          {state.error ||
            (state.pending ? "Saving…" : "Your game saves as you play.")}
        </p>
      </div>
    </section>
  );
}
