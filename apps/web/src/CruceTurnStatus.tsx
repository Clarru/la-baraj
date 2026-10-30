import { cruceTeams, type CruceView } from "../../../packages/shared/cruce";
import { cruceLobby } from "./cruce-lobby";

function turnTitle(v: CruceView) {
  const who =
    v.turn === v.you ? "Tu" : (v.players[v.turn ?? 0]?.name ?? "Un jucător");
  if (v.phase === "lobby") return cruceLobby(v)!.title;
  if (v.phase === "round-end") return "Runda s-a încheiat";
  if (v.phase === "finished")
    return v.winner === null
      ? "Partida s-a oprit"
      : cruceTeams(v.settings.mode)
        ? `Echipa ${v.winner + 1} a câștigat`
        : `${v.players[v.winner]?.name} a câștigat`;
  if (v.phase === "trick")
    return `${v.players[v.trickWinner ?? 0]?.name ?? "Jucătorul"} ia mâna`;
  if (v.phase === "cut")
    return v.turn === v.you ? "Tu tai sau bați" : `${who} taie sau bate`;
  if (v.phase === "bidding")
    return v.turn === v.you ? "Tu licitezi" : `${who} licitează`;
  if (v.phase === "trump")
    return v.turn === v.you ? "Tu alegi tromful" : `${who} alege tromful`;
  if (v.phase === "exchange")
    return v.turn === v.you
      ? "Tu dai cărțile din talon"
      : `${who} dă cărțile din talon`;
  return v.turn === v.you ? "Tu joci" : `${who} joacă`;
}
export function CruceTurnStatus({
  view: v,
  connected,
  now,
  onSync,
  error,
}: {
  view: CruceView;
  connected: boolean;
  now: number;
  onSync?: () => void;
  error?: string;
}) {
  const active = !["lobby", "round-end", "finished"].includes(v.phase);
  const away = active ? v.players.find((p) => p && !p.online) : null;
  const title = !connected
    ? "Conexiune întreruptă"
    : away
      ? `${away.name} se reconectează`
      : turnTitle(v);
  const timed =
    connected && !away && active && v.phase !== "trick" && v.deadline !== null;
  const seconds = timed
    ? v.turnOverdue
      ? 0
      : Math.max(0, Math.min(60, Math.ceil((v.deadline! - now) / 1000)))
    : 0;
  const overdue = timed && (v.turnOverdue || seconds === 0);
  const overdueMessage =
    v.turn === v.you ? "Poți juca în continuare" : "Așteptăm jucătorul";
  const stalled =
    connected &&
    !away &&
    v.phase === "trick" &&
    (v.deadline === null || now > v.deadline + 1500);
  const lobby = cruceLobby(v);
  return (
    <div className="cruce-table-status" aria-label="Starea mesei">
      <h2 role="status" aria-live="polite" aria-atomic="true">
        {title}
      </h2>
      <div className="cruce-table-meta">
        {lobby ? (
          <span>
            {lobby.occupied} din {lobby.total} locuri ocupate
          </span>
        ) : (
          <span>Runda {v.round}</span>
        )}
        {active && v.dealer !== null && (
          <span>Împarte: {v.players[v.dealer]?.name ?? "—"}</span>
        )}
      </div>
      {timed && (
        <div
          className={`cruce-timer${overdue ? " cruce-timer--overdue" : ""}`}
          role="timer"
          aria-live="off"
          aria-label={
            overdue
              ? `Timp depășit. ${overdueMessage}.`
              : `Timp de gândire: ${seconds} secunde`
          }
        >
          <div>
            <span>{overdue ? overdueMessage : "Timp de gândire"}</span>
            <strong>{seconds} s</strong>
          </div>
          <div className="cruce-timer-rail" aria-hidden="true">
            <span style={{ width: `${(seconds / 60) * 100}%` }} />
          </div>
        </div>
      )}
      {away && (
        <span className="cruce-table-reconnect">
          Loc rezervat încă{" "}
          {Math.max(0, Math.ceil(((away.awayUntil ?? now) - now) / 1000))} s
        </span>
      )}
      {stalled && (
        <div className="cruce-table-recovery">
          <span>Actualizăm masa…</span>
          {onSync && <button onClick={onSync}>Sincronizează</button>}
        </div>
      )}
      {v.phase === "finished" && v.winner === null && v.notice && (
        <p className="cruce-table-interruption">{v.notice}</p>
      )}
      {error && (
        <p className="cruce-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
