import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  arcadeOver,
  arcadeWon,
  type ArcadeAction,
  type ArcadeDirection,
} from "../../../packages/shared/arcade2048";
import type { MultiplayerRoom } from "./multiplayer";
import type { ArcadePage, ScreenAction } from "./arcade2048-screen";
export function useArcade2048(
  room: MultiplayerRoom,
  open: boolean,
  onExit?: () => void,
) {
  const view = useSyncExternalStore(room.subscribe, room.getSnapshot),
    [page, setPage] = useState<ArcadePage>("board"),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [focused, setFocused] = useState(false);
  const lastMoveAt = useRef(-Infinity);
  const hardware = useRef<{ kind: string; at: number }>({ kind: "", at: 0 });
  const flight = useRef(false),
    serial = useRef(0),
    direction = useRef<ArcadeDirection | null>(null);
  const run = useCallback(
    async (action: ArcadeAction) => {
      if (flight.current) return;
      flight.current = true;
      const id = ++serial.current;
      setPending(true);
      setError("");
      if (action.kind === "move") direction.current = action.direction;
      else direction.current = null;
      try {
        const failure = await room.arcadeAction(
          action,
          room.getSnapshot().arcade2048?.game?.revision ?? 0,
        );
        if (id === serial.current && failure) setError(failure);
      } catch {
        if (id === serial.current)
          setError(
            "The cabinet could not reach the server. Reopen it to refresh your saved game.",
          );
      } finally {
        if (id === serial.current) {
          flight.current = false;
          setPending(false);
        }
      }
    },
    [room],
  );
  useEffect(() => {
    if (!open) {
      serial.current++;
      flight.current = false;
      setPending(false);
      setPage("board");
      setFocused(false);
      setError("");
      return;
    }
    if (view.status === "online" && view.arcadeAvailable)
      void run({ kind: "resume" });
    else
      setError(
        view.status === "online"
          ? "The arcade is updating. Try again soon."
          : "Reconnecting. Your saved game will return when the world reconnects.",
      );
  }, [open, view.status, view.arcadeAvailable, run]);
  const action = useCallback(
    (value: ScreenAction) => {
      if (value === "leave") {
        onExit?.();
        return;
      }
      if (!open || flight.current) return;
      hardware.current = { kind: value, at: performance.now() };
      if (value === "back") {
        setPage("board");
        setError("");
      } else if (value === "scores") {
        setPage("leaders");
        void run({ kind: "leaders" });
      } else if (value === "new") {
        if ((room.getSnapshot().arcade2048?.game?.moves ?? 0) > 0)
          setPage("confirm");
        else void run({ kind: "new" });
      } else if (value === "confirm") {
        setPage("board");
        void run({ kind: "new" });
      } else {
        const game = room.getSnapshot().arcade2048?.game;
        if (game)
          void run({
            kind:
              arcadeWon(game) && !game.continued
                ? "continue"
                : arcadeOver(game)
                  ? "new"
                  : "continue",
          });
      }
    },
    [open, room, run, onExit],
  );
  const move = useCallback(
    (d: ArcadeDirection) => {
      const now = performance.now();
      if (now - lastMoveAt.current < 150) return;
      if (
        open &&
        page === "board" &&
        !flight.current &&
        room.getSnapshot().arcade2048?.game
      ) {
        lastMoveAt.current = now;
        void run({ kind: "move", direction: d });
      }
    },
    [open, page, room, run],
  );
  const state = useMemo(
    () => ({
      view: view.arcade2048,
      page,
      active: open,
      pending,
      error,
      local: room.localPreview,
      focused,
    }),
    [view.arcade2048, page, open, pending, error, room.localPreview, focused],
  );
  return { state, action, move, direction, hardware, setFocused };
}
