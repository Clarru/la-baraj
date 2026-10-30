import {
  activeCruceSeats,
  type CruceView,
} from "../../../packages/shared/cruce";

/** Pre-game states of the one physical table, not virtual rooms or a table browser. */
export function cruceLobby(view: CruceView) {
  if (!["lobby", "finished"].includes(view.phase)) return null;
  const seats = activeCruceSeats(view.settings.mode);
  const occupied = seats.filter((s) => view.players[s]);
  const away = occupied.find((s) => !view.players[s]!.online);
  const waiting = occupied.filter((s) => !view.players[s]!.ready);
  const count = occupied.length,
    total = seats.length;
  let title: string, detail: string;
  if (!count) {
    title = "Masa este liberă";
    detail =
      "Alege un loc la masa de Cruce. Primul jucător așezat stabilește varianta și regulile.";
  } else if (away !== undefined) {
    title = "Așteptăm reconectarea";
    detail = `Locul lui ${view.players[away]!.name} este rezervat până revine. Partida poate continua când toți sunt conectați.`;
  } else if (view.you === null && count === total) {
    title = "Masa este completă";
    detail =
      "Poți urmări partida. Ca să joci, așteaptă să se elibereze un loc.";
  } else if (view.you === null) {
    title = "Alege un loc la masă";
    detail = `${count} din ${total} locuri sunt ocupate. Așază-te pe unul dintre locurile libere ca să joci.`;
  } else if (count < total) {
    title = "Așteptăm jucători";
    detail = `${count} din ${total} locuri sunt ocupate. Mai ${total - count === 1 ? "lipsește un jucător" : `lipsesc ${total - count} jucători`}.`;
  } else if (view.players[view.you]?.ready) {
    title = "Ești pregătit";
    detail = waiting.length
      ? `Așteptăm: ${waiting.map((s) => view.players[s]!.name).join(", ")}.`
      : "Toți sunt pregătiți. Începe împărțirea cărților.";
  } else {
    title = "Putem începe partida";
    detail =
      "Apasă „Pregătit”. Cărțile se împart după ce fiecare jucător confirmă.";
  }
  return {
    title,
    detail,
    occupied: count,
    total,
    ready: count - waiting.length,
    canReady: count === total && away === undefined,
  };
}
export const CRUCE_SEAT_LABELS = [
  "spre mal",
  "din stânga",
  "spre lac",
  "din dreapta",
] as const;
