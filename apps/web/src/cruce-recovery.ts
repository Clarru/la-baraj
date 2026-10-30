import {
  activeCruceSeats,
  type CruceView,
} from "../../../packages/shared/cruce";
/** Complete tricks need no player input. Request a fresh authoritative snapshot if collection stalls. */
export function cruceRecoveryDelay(
  view: CruceView | null,
  now: number,
): number | null {
  if (
    !view ||
    view.you === null ||
    view.phase !== "trick" ||
    !activeCruceSeats(view.settings.mode).every((s) => view.players[s]?.online)
  )
    return null;
  return view.deadline === null
    ? 5000
    : Math.max(500, Math.min(5000, view.deadline - now + 1500));
}
export function publicCruceDiagnostics(view: CruceView | null) {
  return view
    ? {
        phase: view.phase,
        revision: view.revision,
        mode: view.settings.mode,
        turn: view.turn,
        deadline: view.deadline,
        trickCount: view.trick.length,
        stockCount: view.stockCount,
        playerCount: view.players.filter(Boolean).length,
        awayCount: view.players.filter((p) => p && !p.online).length,
      }
    : null;
}
