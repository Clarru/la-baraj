import { CruceTurnStatus } from "./CruceTurnStatus";
import { CRUCE_CARD_FRAME } from "../../../packages/shared/cruce-card-frame";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  activeCruceSeats,
  canAnnounce,
  cardName,
  cardPoints,
  CRUCE_SUITS,
  CRUCE_MODES,
  cruceTeams,
  DEFAULT_CRUCE_SETTINGS,
  rankOf,
  scoreGroup,
  suitOf,
  type Card,
  type CruceAction,
  type CruceSeat,
  type CruceSettings,
  type CruceView,
} from "../../../packages/shared/cruce";
import { worldNow } from "./day-night";
import { cruceLobby, CRUCE_SEAT_LABELS } from "./cruce-lobby";
import "./cruce.css";

export const CRUCE_MODE_NAMES: Record<CruceSettings["mode"], string> = {
  duel: "În 2 · Duel",
  "trio-standard": "În 3 · Standard",
  "trio-talon": "În 3 · Cu talon",
  "four-individual": "În 4 · Fiecare pentru el",
  "four-classic": "În 4 · Echipe, clasic",
  "four-standard": "În 4 · Echipe, standard",
};
export const CRUCE_CARD_FILES = ["heart", "bell", "leaf", "acorn"];
export const CRUCE_CARD_RANK_FILES = [
  "unter",
  "ober",
  "king",
  "nine",
  "ten",
  "ace",
];
export function cruceCardUrl(card: Card) {
  return `/assets/cruce/${CRUCE_CARD_FILES[suitOf(card)]}-${CRUCE_CARD_RANK_FILES[rankOf(card)]}.webp`;
}
export function SuitMark({ suit }: { suit: number }) {
  const paths = [
    "M12 21C8 17 2 13 2 7a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 6-6 10-10 14Z",
    "M5 15c0-3 1-6 3-7V6a4 4 0 0 1 8 0v2c2 1 3 4 3 7l2 3H3l2-3Zm5 5h4l-2 2-2-2Z",
    "M12 2C3 5 0 13 5 18c6 6 15 1 16-15-3 3-6 2-9-1Zm0 5v15M6 12l6 5 6-7",
    "M5 11c0 7 4 9 7 11 3-2 7-4 7-11H5Zm-2 0h18V9a9 9 0 0 0-18 0v2Zm9-9V0",
  ];
  return (
    <svg
      className={`cruce-suit cruce-suit--${suit}`}
      viewBox="0 0 24 24"
      aria-label={CRUCE_SUITS[suit]}
    >
      <path d={paths[suit]} />
    </svg>
  );
}
const cardFrameStyle: CSSProperties = {
  aspectRatio: `${CRUCE_CARD_FRAME.width} / ${CRUCE_CARD_FRAME.height}`,
  borderRadius: `${(CRUCE_CARD_FRAME.radius / CRUCE_CARD_FRAME.width) * 100}% / ${(CRUCE_CARD_FRAME.radius / CRUCE_CARD_FRAME.height) * 100}%`,
};
export function CruceCard({
  card,
  hidden = false,
}: {
  card?: Card;
  hidden?: boolean;
}) {
  return hidden || card === undefined ? (
    <span
      className="cruce-card cruce-card--back"
      aria-label="Carte cu fața în jos"
      style={cardFrameStyle}
    ></span>
  ) : (
    <span
      className="cruce-card"
      role="img"
      aria-label={`${cardName(card)}, ${cardPoints(card)} puncte`}
      style={
        {
          ...cardFrameStyle,
          backgroundImage: `url("${cruceCardUrl(card)}")`,
        } as CSSProperties
      }
    />
  );
}
export type CruceBoardProps = {
  view: CruceView | null;
  connected: boolean;
  open: boolean;
  onAction: (a: CruceAction, revision: number) => Promise<string | null>;
  onClose: () => void;
  onLeave: () => void;
  onSit: (s: CruceSeat) => Promise<boolean>;
  leaveRequest?: number;
  onSync?: () => void;
};
export default function CruceBoard({
  view: v,
  connected,
  open,
  onAction,
  onClose,
  onLeave,
  onSit,
  leaveRequest = 0,
  onSync,
}: CruceBoardProps) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [draft, setDraft] = useState<CruceSettings>(
    v?.settings ?? DEFAULT_CRUCE_SETTINGS,
  );
  const [giveTo, setGiveTo] = useState<CruceSeat | null>(null);
  const [rules, setRules] = useState(false),
    [now, setNow] = useState(worldNow);
  const [changingSeat, setChangingSeat] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leaveSequence = useRef(leaveRequest);
  const cancelLeave = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLElement>(null),
    busy = useRef(false);
  useEffect(() => {
    if (v) setDraft(v.settings);
  }, [
    v?.settings.mode,
    v?.settings.target,
    v?.settings.iber,
    v?.settings.cheating,
  ]);
  useEffect(() => {
    setGiveTo(null);
  }, [v?.round, v?.turn, v?.phase]);
  useEffect(() => {
    if (!open) return;
    setNow(worldNow());
    const previous = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    const timer = setInterval(() => setNow(worldNow()), 1000);
    return () => {
      clearInterval(timer);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    if (leaveSequence.current === leaveRequest) return;
    leaveSequence.current = leaveRequest;
    if (v && !["lobby", "finished", "round-end"].includes(v.phase))
      setConfirmLeave(true);
    else onLeave();
  }, [leaveRequest, v?.phase, onLeave]);
  useEffect(() => {
    if (confirmLeave) cancelLeave.current?.focus();
  }, [confirmLeave]);
  useEffect(() => {
    if (
      !v ||
      v.you === null ||
      ["lobby", "round-end", "finished"].includes(v.phase)
    )
      setConfirmLeave(false);
  }, [v?.phase, v?.you]);
  if (!open) return null;
  const you = v?.you ?? null,
    own = you === null ? null : v?.players[you];
  const active = activeCruceSeats(
    v?.settings.mode ?? DEFAULT_CRUCE_SETTINGS.mode,
  );
  const myTurn = connected && !pending && you !== null && v?.turn === you;
  const away = v?.players.find((p) => p && !p.online);
  const disabled = pending || !connected || Boolean(away);
  const between = v && ["lobby", "finished"].includes(v.phase);
  const groups = [
    ...new Set(
      active.map((s) =>
        scoreGroup(s, v?.settings.mode ?? DEFAULT_CRUCE_SETTINGS.mode),
      ),
    ),
  ];
  const lobby = v ? cruceLobby(v) : null;
  const tooManyPlayers = Boolean(
    v && v.players.filter(Boolean).length > activeCruceSeats(draft.mode).length,
  );
  const requestLeave = () => {
    if (v && !["lobby", "finished", "round-end"].includes(v.phase))
      setConfirmLeave(true);
    else onLeave();
  };
  const name = (seat: number) => v?.players[seat]?.name ?? "Loc liber";
  // Keep the same compass order for public plays and the seats around the square.
  const tablePosition = (seat: CruceSeat) => {
    const index = active.indexOf(seat);
    const position =
      you === null
        ? index
        : (index - active.indexOf(you) + active.length) % active.length;
    return active.length === 2 ? position * 2 : position;
  };
  const act = async (action: CruceAction) => {
    if (!v || busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      setError((await onAction(action, v.revision)) ?? "");
    } catch {
      setError("Acțiunea nu a putut fi salvată. Încearcă din nou.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const sit = async (seat: CruceSeat) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      if (await onSit(seat)) setChangingSeat(false);
      else
        setError(
          "Locul nu este disponibil. Apropie-te de masă și alege un loc liber.",
        );
    } catch {
      setError("Locul nu a putut fi rezervat. Încearcă din nou.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const trap = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (confirmLeave) setConfirmLeave(false);
      else onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [
      ...((confirmLeave
        ? ref.current?.querySelector(".cruce-exit")
        : ref.current
      )?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href]",
      ) ?? []),
    ].filter((e) => e.offsetParent !== null);
    const first = controls[0],
      last = controls.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === ref.current)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  return (
    <div className="cruce-overlay" data-testid="cruce-board">
      <section
        className="cruce-board"
        lang="ro"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cruce-title"
        tabIndex={-1}
        ref={ref}
        onKeyDown={trap}
      >
        <header className="cruce-header">
          <div>
            <h1 id="cruce-title">Cruce</h1>
            <span>
              {v ? CRUCE_MODE_NAMES[v.settings.mode] : "Se încarcă masa…"}
            </span>
          </div>
          <div className="cruce-header-actions">
            <button onClick={() => setRules((r) => !r)} aria-expanded={rules}>
              Reguli
            </button>
            <button onClick={onClose}>
              Înapoi la lac <kbd>Esc</kbd>
            </button>
            {you !== null && (
              <button onClick={requestLeave}>
                Ridică-te <kbd>F</kbd>
              </button>
            )}
          </div>
        </header>
        {rules && (
          <div className="cruce-rules">
            <h2>Cum se joacă Cruce</h2>
            <p>
              Pachetul are 24 de cărți ungurești, în patru culori: roșu, dubă,
              verde și ghindă. De la mic la mare: nouar (0), doiar (2), treiar
              (3), pătrar (4), zecar (10), as (11).
            </p>
            <p>
              Licitezi o singură dată: 1 înseamnă 33 de puncte, 2 înseamnă 66,
              până la 6 — 198. Poți spune „Pas”. Cel care licitează cel mai mult
              alege tromful și iese primul.
            </p>
            <p>
              Răspunzi obligatoriu la culoare. Dacă nu ai culoarea cerută, dai
              tromf; dacă nu ai nici tromf, poți da orice carte. La duel, cât
              timp mai sunt cărți în talon, poți juca orice carte.
            </p>
            <p>
              Treiarul și pătrarul de aceeași culoare formează un anunț: 20 de
              puncte, sau 40 dacă sunt tromfi. Anunțul se strigă automat când
              ieși cu una dintre ele și le ai pe amândouă în mână. La iber
              trebuie să mărești pe culoarea cerută, când poți și nu s-a dat
              deja un tromf peste ea.
            </p>
            <p>
              Scorul rundei este partea întreagă din punctele adunate împărțite
              la 33. Dacă nu îți faci licitația, pierzi punctele licitate. La
              echipe, partenerii stau față în față și își adună punctele. La
              egalitate se mai joacă.
            </p>
            <p>
              În 4 standard, dacă tai, se licitează din 3 cărți și se anunță
              tromful înaintea restului; dacă bați, se licitează din toate cele
              6, iar prima carte stabilește tromful. În 3 standard se licitează
              din 4 și apoi se mai primesc 4. În 3 cu talon, câștigătorul
              licitației ia cele 3 cărți rămase și dă câte una fiecărui
              adversar.
            </p>
            {v?.settings.cheating && (
              <p>
                Trișarea este activată. Poți cere penalizarea unui adversar
                înaintea rundei următoare. Dacă a trișat, pierde 3 puncte plus
                licitația câștigată, iar runda se reface. O acuzație nefondată
                te costă 3 puncte.
              </p>
            )}
            <a
              href="https://tromf.ro/tutorial.htm"
              target="_blank"
              rel="noreferrer"
            >
              Tutorialul de pe tromf.ro
            </a>
          </div>
        )}
        <div className="cruce-workspace" hidden={rules}>
          {!v ? (
            <div className="cruce-empty">
              Așteptăm datele mesei. Dacă nu apar, verifică legătura la joc și
              încearcă din nou.
            </div>
          ) : (
            <>
              <div
                className={`cruce-table-stage${v.hand.length ? "" : " cruce-table-stage--no-hand"}`}
              >
                <div
                  className={`cruce-felt${lobby ? " cruce-felt--lobby" : ""}`}
                >
                  {active.map((seat) => {
                    const labelPosition = tablePosition(seat);
                    const p = v.players[seat];
                    const call = v.trick.find(
                      (c) => c.seat === seat && c.announcement > 0,
                    );
                    return (
                      <div
                        key={seat}
                        className={`cruce-player cruce-player--${labelPosition}${v.turn === seat ? " cruce-player--turn" : ""}${you === seat ? " cruce-player--you" : ""}`}
                      >
                        <strong title={p?.name}>
                          {p
                            ? `${p.name}${seat === you ? " · Tu" : ""}`
                            : "Loc liber"}
                        </strong>
                        <span>
                          {cruceTeams(v.settings.mode)
                            ? `Echipa ${(seat % 2) + 1} · `
                            : ""}
                          {v.handCounts[seat] > 0
                            ? `${v.handCounts[seat]} cărți`
                            : p?.ready
                              ? "Pregătit"
                              : ""}
                          {v.phase === "bidding" && v.bids[seat] === 0
                            ? " · Pas"
                            : ""}
                        </span>
                        {!p && (you === null || changingSeat) && (
                          <button
                            aria-label={`Ocupă locul ${CRUCE_SEAT_LABELS[seat]}`}
                            disabled={disabled || !between}
                            onClick={() => void sit(seat)}
                          >
                            Așază-te
                          </button>
                        )}
                        {(call || (p && v.bidder === seat && v.bid > 0)) && (
                          <span
                            key={
                              call
                                ? `${v.round}:call:${call.card}`
                                : `${v.round}:bid:${v.bid}`
                            }
                            className={`cruce-call${call || v.phase === "bidding" ? " cruce-call--fresh" : ""}`}
                            aria-label={
                              call
                                ? `${p?.name} a strigat ${call.announcement}`
                                : `${p?.name} a strigat ${v.bid}`
                            }
                          >
                            {call ? (
                              <strong>+{call.announcement}</strong>
                            ) : (
                              <>
                                <strong>{v.bid}</strong>
                                <span>· {v.bid * 33}</span>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <div
                    className={`cruce-center${v.trick.length ? "" : " cruce-center--empty"}`}
                  >
                    <CruceTurnStatus
                      view={v}
                      connected={connected}
                      now={now}
                      onSync={onSync}
                      error={error}
                    />
                    <div className="cruce-cards-zone">
                      <div className="cruce-trick">
                        {v.trick.map((p) => (
                          <div
                            className={`cruce-played cruce-played--${tablePosition(p.seat)}`}
                            key={p.seat}
                            title={name(p.seat)}
                            role="group"
                            aria-label={`Carte jucată de ${name(p.seat)}`}
                          >
                            <span>{name(p.seat)}</span>
                            <CruceCard card={p.card} />
                            {p.announcement > 0 && (
                              <strong>+{p.announcement}</strong>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {v.stockCount > 0 && (
                    <div className="cruce-stock">
                      <CruceCard hidden />
                      <span>{v.stockCount} în talon</span>
                    </div>
                  )}
                  {v.trump !== null && (
                    <div className="cruce-table-trump">
                      <SuitMark suit={v.trump} />
                      <span>
                        <small>Tromf</small>
                        {CRUCE_SUITS[v.trump]}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <aside
                className="cruce-sidebar"
                aria-label="Scor, stare și comenzi"
              >
                <div className="cruce-score-strip" aria-label="Scorul partidei">
                  {groups.map((group) => (
                    <div key={group}>
                      <span>
                        {v && cruceTeams(v.settings.mode)
                          ? `${name(group)} + ${name(group + 2)}`
                          : name(group)}
                      </span>
                      <strong>{v?.scores[group] ?? 0}</strong>
                    </div>
                  ))}
                  <span>Partidă de {v?.settings.target ?? 11}</span>
                </div>
                {!connected && (
                  <p className="cruce-connection" role="status">
                    {you !== null
                      ? "Conexiunea s-a întrerupt. Locul tău este rezervat 30 de secunde."
                      : "Conexiunea s-a întrerupt. Așteptăm reconectarea ca să poți ocupa un loc."}
                  </p>
                )}
                {away && (
                  <p className="cruce-connection" role="status">
                    Rundă în pauză · {away.name} se reconectează (
                    {Math.max(
                      0,
                      Math.ceil(((away.awayUntil ?? now) - now) / 1000),
                    )}
                    s).
                  </p>
                )}
                {lobby && (
                  <div className="cruce-lobby" role="status">
                    <p>{lobby.detail}</p>
                    <span>
                      {lobby.occupied} / {lobby.total} locuri · {lobby.ready}{" "}
                      pregătiți
                      {v.host !== null ? ` · Regulile: ${name(v.host)}` : ""}
                    </span>
                    <span>
                      Iber: {v.settings.iber ? "da" : "nu"} · Trișare:{" "}
                      {v.settings.cheating ? "da" : "nu"}
                    </span>
                  </div>
                )}
                {between && you !== null && v.host === you && (
                  <div className="cruce-settings" aria-label="Regulile mesei">
                    <label>
                      Varianta de joc
                      <select
                        value={draft.mode}
                        disabled={disabled || you === null || v.host !== you}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            mode: e.target.value as CruceSettings["mode"],
                          })
                        }
                      >
                        {CRUCE_MODES.map((m) => (
                          <option value={m} key={m}>
                            {CRUCE_MODE_NAMES[m]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Partidă de
                      <select
                        value={draft.target}
                        disabled={disabled || you === null || v.host !== you}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            target: Number(
                              e.target.value,
                            ) as CruceSettings["target"],
                          })
                        }
                      >
                        {[6, 11, 15, 21].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.iber}
                        disabled={disabled || you === null || v.host !== you}
                        onChange={(e) =>
                          setDraft({ ...draft, iber: e.target.checked })
                        }
                      />
                      Iber (mărit)
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.cheating}
                        disabled={disabled || you === null || v.host !== you}
                        onChange={(e) =>
                          setDraft({ ...draft, cheating: e.target.checked })
                        }
                      />
                      Trișare
                    </label>
                    {v.host === you && you !== null && (
                      <button
                        disabled={
                          disabled ||
                          JSON.stringify(draft) ===
                            JSON.stringify(v.settings) ||
                          tooManyPlayers
                        }
                        onClick={() =>
                          void act({ kind: "configure", settings: draft })
                        }
                      >
                        Aplică regulile
                      </button>
                    )}
                  </div>
                )}
                {between && you === v.host && tooManyPlayers && (
                  <p className="cruce-settings-help" role="status">
                    Sunt {v.players.filter(Boolean).length} jucători la masă.
                    Varianta aleasă acceptă{" "}
                    {activeCruceSeats(draft.mode).length}; alege o variantă cu
                    suficiente locuri.
                  </p>
                )}
                {between &&
                  you === v.host &&
                  JSON.stringify(draft) !== JSON.stringify(v.settings) && (
                    <p className="cruce-settings-help">
                      Aplică regulile. Locurile se aranjează automat pentru
                      varianta aleasă, apoi toți jucătorii confirmă din nou.
                    </p>
                  )}
                {(v.phase === "round-end" ||
                  (v.phase === "finished" && v.winner !== null)) && (
                  <table className="cruce-results">
                    <caption>Rezultatul rundei {v.round}</caption>
                    <thead>
                      <tr>
                        <th>Jucător / echipă</th>
                        <th>Puncte adunate</th>
                        <th>Scor</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g) => (
                        <tr key={g}>
                          <th>
                            {cruceTeams(v.settings.mode)
                              ? `Echipa ${g + 1}`
                              : name(g)}
                          </th>
                          <td>{v.roundPoints[g]}</td>
                          <td>
                            {v.roundScores[g] > 0 ? "+" : ""}
                            {v.roundScores[g]}
                          </td>
                          <td>{v.scores[g]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="cruce-actions">
                  {you === null ? (
                    <p>
                      Așază-te pe un loc liber ca să joci. Ca spectator vezi
                      numai cărțile jucate pe masă.
                    </p>
                  ) : (
                    <>
                      {between && (
                        <button
                          disabled={pending || !connected}
                          aria-pressed={changingSeat}
                          onClick={() => setChangingSeat((c) => !c)}
                        >
                          {changingSeat
                            ? "Renunță la schimbarea locului"
                            : "Schimbă locul"}
                        </button>
                      )}
                      {between && (
                        <button
                          className="cruce-primary"
                          disabled={
                            disabled ||
                            Boolean(own?.ready) ||
                            !lobby?.canReady ||
                            JSON.stringify(draft) !== JSON.stringify(v.settings)
                          }
                          onClick={() => void act({ kind: "ready" })}
                        >
                          {own?.ready
                            ? "Pregătit · îi așteptăm pe ceilalți"
                            : v.phase === "finished"
                              ? "Pregătit pentru o partidă nouă"
                              : "Pregătit"}
                        </button>
                      )}
                      {v.phase === "round-end" && (
                        <button
                          className="cruce-primary"
                          disabled={disabled || Boolean(own?.ready)}
                          onClick={() => void act({ kind: "continue" })}
                        >
                          {own?.ready
                            ? "Îi așteptăm pe ceilalți"
                            : "Runda următoare"}
                        </button>
                      )}
                      {v.phase === "cut" && myTurn && (
                        <>
                          <button
                            disabled={disabled}
                            onClick={() => void act({ kind: "cut", cut: true })}
                          >
                            Tai cărțile
                          </button>
                          <button
                            disabled={disabled}
                            onClick={() =>
                              void act({ kind: "cut", cut: false })
                            }
                          >
                            Bat cărțile
                          </button>
                        </>
                      )}
                      {v.phase === "bidding" && (
                        <div className="cruce-bids" aria-label="Licitație">
                          <button
                            disabled={!myTurn || disabled}
                            onClick={() => void act({ kind: "bid", value: 0 })}
                          >
                            Pas
                          </button>
                          {[1, 2, 3, 4, 5, 6].map((b) => (
                            <button
                              key={b}
                              disabled={!myTurn || disabled || b <= v.bid}
                              onClick={() =>
                                void act({ kind: "bid", value: b })
                              }
                            >
                              <strong>{b}</strong>
                              <span>{b * 33}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {v.phase === "trump" &&
                        myTurn &&
                        CRUCE_SUITS.map((s, i) => (
                          <button
                            className="cruce-trump-choice"
                            key={s}
                            disabled={disabled}
                            onClick={() => void act({ kind: "trump", suit: i })}
                          >
                            <SuitMark suit={i} />
                            {s}
                          </button>
                        ))}
                      {v.phase === "exchange" && myTurn && (
                        <>
                          <span>Dă o carte lui:</span>
                          {active
                            .filter((s) => s !== you && !v.given.includes(s))
                            .map((s) => (
                              <button
                                aria-pressed={giveTo === s}
                                key={s}
                                disabled={disabled}
                                onClick={() => setGiveTo(s)}
                              >
                                {name(s)}
                              </button>
                            ))}
                          <span>
                            Alege jucătorul, apoi cartea pe care i-o dai.
                          </span>
                        </>
                      )}
                      {v.settings.cheating &&
                        (["playing", "trick", "round-end"].includes(v.phase) ||
                          (v.phase === "finished" && v.winner !== null)) &&
                        active
                          .filter(
                            (s) =>
                              scoreGroup(s, v.settings.mode) !==
                              scoreGroup(you, v.settings.mode),
                          )
                          .map((s) => (
                            <button
                              disabled={disabled}
                              key={s}
                              onClick={() =>
                                void act({ kind: "accuse", seat: s })
                              }
                            >
                              Penalizare pentru {name(s)} (−3 dacă acuzația e
                              nefondată)
                            </button>
                          ))}
                    </>
                  )}
                </div>
              </aside>
              {v.hand.length > 0 && (
                <div className="cruce-hand-zone">
                  <h2>Cărțile tale</h2>
                  <div
                    className="cruce-hand"
                    aria-label="Cărțile tale"
                    style={
                      { "--cruce-hand-count": v.hand.length } as CSSProperties
                    }
                  >
                    {[...v.hand]
                      .sort(
                        (a, b) =>
                          suitOf(a) - suitOf(b) ||
                          cardPoints(b) - cardPoints(a),
                      )
                      .map((card) => {
                        const playable =
                          myTurn &&
                          !disabled &&
                          (v.phase === "exchange"
                            ? giveTo !== null
                            : v.phase === "playing" &&
                              (v.settings.cheating ||
                                v.legalCards.includes(card)));
                        return (
                          <button
                            key={card}
                            disabled={!playable}
                            title={`${cardName(card)} · ${cardPoints(card)} puncte`}
                            aria-label={`${v.phase === "exchange" ? "Dă" : "Joacă"} ${cardName(card)}`}
                            onClick={() =>
                              void act(
                                v.phase === "exchange"
                                  ? { kind: "give", card, to: giveTo! }
                                  : {
                                      kind: "play",
                                      card,
                                      announce: canAnnounce(
                                        {
                                          hands: [0, 1, 2, 3].map((s) =>
                                            s === you ? v.hand : [],
                                          ),
                                          trick: v.trick,
                                          announced: v.announced,
                                        },
                                        you!,
                                        card,
                                      ),
                                    },
                              )
                            }
                          >
                            <CruceCard card={card} />
                            <span>
                              {
                                ["Doiar", "Treiar", "Pătrar", "9", "10", "As"][
                                  rankOf(card)
                                ]
                              }{" "}
                              · {cardPoints(card)}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {confirmLeave && (
          <div className="cruce-exit-shade">
            <div
              className="cruce-exit"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="cruce-exit-title"
            >
              <h2 id="cruce-exit-title">Te ridici de la masă?</h2>
              <p>
                Partida în curs se oprește pentru toți. Runda neterminată nu
                aduce puncte.
              </p>
              <div>
                <button
                  ref={cancelLeave}
                  onClick={() => setConfirmLeave(false)}
                >
                  Rămân la masă
                </button>
                <button
                  className="cruce-primary"
                  onClick={() => {
                    setConfirmLeave(false);
                    onLeave();
                  }}
                >
                  Mă ridic
                </button>
              </div>
            </div>
          </div>
        )}
        <footer className="cruce-footer">
          <span>
            {pending
              ? "Se salvează mutarea…"
              : you !== null
                ? "Doar tu îți vezi cărțile. La echipe, partenerul stă în fața ta."
                : "Cruce · 24 de cărți ungurești"}
          </span>
          <span>Roșu · Dubă · Verde · Ghindă</span>
        </footer>
      </section>
    </div>
  );
}
