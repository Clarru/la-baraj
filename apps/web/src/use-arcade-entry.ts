import { useCallback, useEffect, useRef, useState } from "react";
import type { MultiplayerRoom } from "./multiplayer";
import { arcadeConnectionMessage } from "./use-arcade2048";
/** Claim before focusing. Cancellation releases the pending station, never a later claim. */
export function useArcadeEntry(
  room: MultiplayerRoom,
  enabled: boolean,
  blocked: boolean,
  canApproach: (id: number) => boolean,
  onOpened: () => void,
) {
  const [stationId, setStationId] = useState<number | null>(null),
    [opening, setOpening] = useState(false),
    [error, setError] = useState("");
  const current = useRef({
    selected: null as number | null,
    pending: null as number | null,
    generation: 0,
    opening: false,
    enabled,
  });
  current.current.enabled = enabled;
  const close = useCallback(() => {
    const c = current.current,
      id = c.selected ?? c.pending;
    c.generation++;
    c.selected = null;
    c.pending = null;
    c.opening = false;
    if (id !== null) room.leaveArcade(id);
    setStationId(null);
    setOpening(false);
  }, [room]);
  useEffect(
    () => () => {
      const c = current.current,
        id = c.selected ?? c.pending;
      c.generation++;
      c.selected = null;
      c.pending = null;
      c.opening = false;
      if (id !== null) room.leaveArcade(id);
    },
    [room],
  );
  useEffect(() => {
    if (!enabled) close();
  }, [enabled, close]);
  useEffect(() => {
    if (stationId !== null && blocked) {
      setError(
        "This cabinet is occupied or no longer available. Choose a free cabinet.",
      );
      close();
    }
  }, [stationId, blocked, close]);
  const open = useCallback(
    async (id: number) => {
      const c = current.current;
      if (!c.enabled || !canApproach(id) || c.opening || c.selected !== null)
        return;
      const v = room.getSnapshot(),
        unavailable = arcadeConnectionMessage(v);
      if (unavailable) {
        setError(unavailable);
        return;
      }
      const occupant = v.arcadeStations.find((s) => s.id === id);
      if (occupant?.playerId && occupant.playerId !== v.selfId) {
        setError("Occupied. Choose another cabinet.");
        return;
      }
      const generation = ++c.generation;
      c.pending = id;
      c.opening = true;
      setOpening(true);
      setError("");
      try {
        const failure = await room.arcadeAction(
          { kind: "resume" },
          room.getSnapshot().arcade2048?.game?.revision ?? 0,
          id,
        );
        // close() already sent the release. A late release here could evict a newer opening.
        if (generation !== c.generation) return;
        if (failure) {
          setError(failure);
          room.leaveArcade(id);
          return;
        }
        const latest = room.getSnapshot(),
          own =
            id < 0 ||
            latest.arcadeStations.some(
              (s) => s.id === id && s.playerId === latest.selfId,
            );
        if (
          !own ||
          !canApproach(id) ||
          !c.enabled ||
          latest.status !== "online"
        ) {
          room.leaveArcade(id);
          return;
        }
        onOpened();
        c.selected = id;
        setStationId(id);
      } catch {
        if (generation === c.generation) {
          setError("Could not open the cabinet. Try again.");
          room.leaveArcade(id);
        }
      } finally {
        if (generation === c.generation) {
          c.pending = null;
          c.opening = false;
          setOpening(false);
        }
      }
    },
    [room, canApproach, onOpened],
  );
  return { stationId, opening, error, open, close };
}
