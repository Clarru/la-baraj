/** Cruce rules reference: https://tromf.ro/tutorial.htm (see docs/cruce.md). */
export const CRUCE_SUITS = ["Roșu", "Dubă", "Verde", "Ghindă"] as const;
export const CRUCE_RANKS = [
  "Doiar",
  "Treiar",
  "Pătrar",
  "Nouar",
  "Zecar",
  "As",
] as const;
export const CRUCE_MODES = [
  "duel",
  "trio-standard",
  "trio-talon",
  "four-individual",
  "four-classic",
  "four-standard",
] as const;
export type CruceMode = (typeof CRUCE_MODES)[number];
export type Card = number;
export type CruceSeat = 0 | 1 | 2 | 3;
export type CruceSettings = {
  mode: CruceMode;
  target: 6 | 11 | 15 | 21;
  iber: boolean;
  cheating: boolean;
};
export const DEFAULT_CRUCE_SETTINGS: CruceSettings = {
  mode: "four-standard",
  target: 11,
  iber: false,
  cheating: false,
};
export const suitOf = (card: Card) => Math.floor(card / 6);
export const rankOf = (card: Card) => card % 6;
export const cardPoints = (card: Card) => [2, 3, 4, 0, 10, 11][rankOf(card)];
const strength = (card: Card) => [1, 2, 3, 0, 4, 5][rankOf(card)];
export const cardName = (card: Card) =>
  `${CRUCE_RANKS[rankOf(card)]} de ${CRUCE_SUITS[suitOf(card)].toLocaleLowerCase("ro")}`;
export const isCard = (n: unknown): n is Card =>
  Number.isInteger(n) && Number(n) >= 0 && Number(n) < 24;
export function activeCruceSeats(mode: CruceMode): CruceSeat[] {
  return mode === "duel"
    ? [0, 2]
    : mode.startsWith("trio")
      ? [0, 1, 2]
      : [0, 1, 2, 3];
}
export const cruceTeams = (mode: CruceMode) =>
  mode === "four-classic" || mode === "four-standard";
export const scoreGroup = (seat: CruceSeat, mode: CruceMode): number =>
  cruceTeams(mode) ? seat % 2 : seat;
export type CruceAction =
  | { kind: "configure"; settings: CruceSettings }
  | { kind: "ready" }
  | { kind: "cut"; cut: boolean }
  | { kind: "bid"; value: number }
  | { kind: "trump"; suit: number }
  | { kind: "give"; card: Card; to: CruceSeat }
  | { kind: "play"; card: Card; announce: boolean }
  | { kind: "accuse"; seat: CruceSeat }
  | { kind: "continue" }
  | { kind: "leave" };
export type CrucePhase =
  | "lobby"
  | "cut"
  | "bidding"
  | "trump"
  | "exchange"
  | "playing"
  | "trick"
  | "round-end"
  | "finished";
export type PlayedCard = { seat: CruceSeat; card: Card; announcement: number };
export type CruceGame = {
  settings: CruceSettings;
  phase: CrucePhase;
  round: number;
  dealer: CruceSeat;
  turn: CruceSeat | null;
  bidder: CruceSeat | null;
  bid: number;
  bids: (number | null)[];
  trump: number | null;
  hands: Card[][];
  stock: Card[];
  captured: Card[][];
  trick: PlayedCard[];
  lastTrick: PlayedCard[];
  trickWinner: CruceSeat | null;
  announcements: number[];
  announced: number[];
  given: CruceSeat[];
  scores: number[];
  roundPoints: number[];
  roundScores: number[];
  winner: number | null;
  notice: string;
  /** Private audit trail; only the server may inspect illegal plays. */
  violations: { seat: CruceSeat; card: Card; round: number }[];
};
export type CruceView = Omit<
  CruceGame,
  "hands" | "stock" | "captured" | "violations"
> & {
  version: 1;
  revision: number;
  you: CruceSeat | null;
  hand: Card[];
  handCounts: number[];
  stockCount: number;
  legalCards: Card[];
  players: (null | {
    name: string;
    online: boolean;
    ready: boolean;
    awayUntil: number | null;
  })[];
  deadline: number | null;
  host: CruceSeat | null;
};
export class CruceError extends Error {}
const requireRule: (test: unknown, message: string) => asserts test = (
  test,
  message,
) => {
  if (!test) throw new CruceError(message);
};
export function freshCruce(
  settings: CruceSettings = DEFAULT_CRUCE_SETTINGS,
): CruceGame {
  return {
    settings: { ...settings },
    phase: "lobby",
    round: 0,
    dealer: activeCruceSeats(settings.mode).at(-1)!,
    turn: null,
    bidder: null,
    bid: 0,
    bids: [null, null, null, null],
    trump: null,
    hands: [[], [], [], []],
    stock: [],
    captured: [[], [], [], []],
    trick: [],
    lastTrick: [],
    trickWinner: null,
    announcements: [0, 0, 0, 0],
    announced: [],
    given: [],
    scores: [0, 0, 0, 0],
    roundPoints: [0, 0, 0, 0],
    roundScores: [0, 0, 0, 0],
    winner: null,
    notice: "Așază-te la masă ca să joci Cruce.",
    violations: [],
  };
}
export function validCruceSettings(s: unknown): s is CruceSettings {
  if (!s || typeof s !== "object") return false;
  const v = s as CruceSettings;
  return (
    CRUCE_MODES.includes(v.mode) &&
    [6, 11, 15, 21].includes(v.target) &&
    typeof v.iber === "boolean" &&
    typeof v.cheating === "boolean"
  );
}
export function parseCruceAction(value: unknown): CruceAction | null {
  if (!value || typeof value !== "object") return null;
  const a = value as Record<string, unknown>;
  switch (a.kind) {
    case "ready":
    case "continue":
    case "leave":
      return { kind: a.kind };
    case "configure":
      return validCruceSettings(a.settings)
        ? {
            kind: "configure",
            settings: {
              mode: a.settings.mode,
              target: a.settings.target,
              iber: a.settings.iber,
              cheating: a.settings.cheating,
            },
          }
        : null;
    case "cut":
      return typeof a.cut === "boolean" ? { kind: "cut", cut: a.cut } : null;
    case "bid":
      return Number.isInteger(a.value) &&
        Number(a.value) >= 0 &&
        Number(a.value) <= 6
        ? { kind: "bid", value: Number(a.value) }
        : null;
    case "trump":
      return Number.isInteger(a.suit) &&
        Number(a.suit) >= 0 &&
        Number(a.suit) < 4
        ? { kind: "trump", suit: Number(a.suit) }
        : null;
    case "give":
      return isCard(a.card) &&
        [0, 1, 2, 3].includes(Number(a.to)) &&
        typeof a.to === "number"
        ? { kind: "give", card: a.card, to: a.to as CruceSeat }
        : null;
    case "play":
      return isCard(a.card) && typeof a.announce === "boolean"
        ? { kind: "play", card: a.card, announce: a.announce }
        : null;
    case "accuse":
      return typeof a.seat === "number" && [0, 1, 2, 3].includes(a.seat)
        ? { kind: "accuse", seat: a.seat as CruceSeat }
        : null;
    default:
      return null;
  }
}
function nextSeat(g: CruceGame, seat: CruceSeat): CruceSeat {
  const seats = activeCruceSeats(g.settings.mode);
  return seats[(seats.indexOf(seat) + 1) % seats.length];
}
export function beginCruceRound(
  game: CruceGame,
  random = Math.random,
): CruceGame {
  const g = freshCruce(game.settings);
  g.scores = [...game.scores];
  g.round = game.round + 1;
  g.dealer = game.round ? nextSeat(game, game.dealer) : game.dealer;
  g.stock = Array.from({ length: 24 }, (_, i) => i);
  for (let i = 23; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [g.stock[i], g.stock[j]] = [g.stock[j], g.stock[i]];
  }
  const seats = activeCruceSeats(g.settings.mode);
  g.turn = seats[(seats.indexOf(g.dealer) + seats.length - 1) % seats.length];
  g.phase = "cut";
  g.notice = "Jucătorul din dreapta celui care împarte taie sau bate pachetul.";
  return g;
}
function deal(g: CruceGame, count: number, first = nextSeat(g, g.dealer)) {
  const seats = activeCruceSeats(g.settings.mode);
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[(seats.indexOf(first) + i) % seats.length];
    g.hands[seat].push(...g.stock.splice(0, count));
    g.hands[seat].sort(
      (a, b) => suitOf(a) - suitOf(b) || strength(b) - strength(a),
    );
  }
}
export function winningCruceCard(
  trick: readonly PlayedCard[],
  trump: number | null,
): PlayedCard | null {
  let best = trick[0];
  for (const p of trick.slice(1)) {
    if (
      (suitOf(p.card) === suitOf(best.card) &&
        strength(p.card) > strength(best.card)) ||
      (suitOf(p.card) === trump && suitOf(best.card) !== trump)
    )
      best = p;
  }
  return best ?? null;
}
export function legalCruceCards(
  g: Pick<CruceGame, "settings" | "trick" | "trump" | "stock" | "hands">,
  seat: CruceSeat,
): Card[] {
  const hand = g.hands[seat];
  if (!g.trick.length || (g.settings.mode === "duel" && g.stock.length))
    return [...hand];
  const lead = suitOf(g.trick[0].card),
    followed = hand.filter((c) => suitOf(c) === lead);
  let legal = followed.length
    ? followed
    : hand.filter((c) => suitOf(c) === g.trump);
  if (!legal.length) legal = hand;
  if (g.settings.iber && followed.length) {
    const best = winningCruceCard(g.trick, g.trump)!;
    if (suitOf(best.card) === lead) {
      const higher = followed.filter((c) => strength(c) > strength(best.card));
      if (higher.length) legal = higher;
    }
  }
  return [...legal];
}
export function canAnnounce(
  g: Pick<CruceGame, "trick" | "hands" | "announced">,
  seat: CruceSeat,
  card: Card,
) {
  const suit = suitOf(card);
  return (
    !g.trick.length &&
    [1, 2].includes(rankOf(card)) &&
    !g.announced.includes(suit) &&
    g.hands[seat].includes(suit * 6 + 1) &&
    g.hands[seat].includes(suit * 6 + 2)
  );
}
function scoreRound(g: CruceGame) {
  g.roundPoints = [0, 0, 0, 0];
  for (const seat of activeCruceSeats(g.settings.mode))
    g.roundPoints[scoreGroup(seat, g.settings.mode)] +=
      g.captured[seat].reduce((n, c) => n + cardPoints(c), 0) +
      g.announcements[seat];
  g.roundScores = g.roundPoints.map((p) => Math.floor(p / 33));
  const group = scoreGroup(g.bidder!, g.settings.mode);
  if (g.roundPoints[group] < g.bid * 33) g.roundScores[group] = -g.bid;
  g.scores = g.scores.map((p, i) => p + g.roundScores[i]);
  const groups = [
    ...new Set(
      activeCruceSeats(g.settings.mode).map((s) =>
        scoreGroup(s, g.settings.mode),
      ),
    ),
  ];
  const best = Math.max(...groups.map((i) => g.scores[i]));
  const winners = groups.filter((i) => g.scores[i] === best);
  g.winner =
    best >= g.settings.target && winners.length === 1 ? winners[0] : null;
  g.phase = g.winner === null ? "round-end" : "finished";
  g.turn = null;
  g.notice =
    g.winner === null
      ? "Runda s-a încheiat. Verificați scorul, apoi continuați."
      : "Partida s-a încheiat.";
}
/** Pure transition: failed actions cannot mutate a match, including hands or scores. */
export function moveCruce(
  game: CruceGame,
  seat: CruceSeat,
  action: CruceAction,
  random = Math.random,
): CruceGame {
  const g = structuredClone(game);
  const seats = activeCruceSeats(g.settings.mode);
  requireRule(
    seats.includes(seat),
    "Acest loc nu se folosește în varianta aleasă. Alege unul dintre locurile active.",
  );
  if (action.kind === "accuse") {
    requireRule(
      g.settings.cheating &&
        (["playing", "trick", "round-end"].includes(g.phase) ||
          (g.phase === "finished" && g.winner !== null)),
      "Poți cere penalizare doar într-o rundă cu trișarea activată.",
    );
    requireRule(
      seats.includes(action.seat) &&
        scoreGroup(action.seat, g.settings.mode) !==
          scoreGroup(seat, g.settings.mode),
      "Alege un adversar.",
    );
    const caught = g.violations.some(
      (v) => v.seat === action.seat && v.round === g.round,
    );
    const penalized = scoreGroup(caught ? action.seat : seat, g.settings.mode);
    if (caught) {
      if (g.phase === "round-end" || g.phase === "finished")
        g.scores = g.scores.map((p, i) => p - g.roundScores[i]);
      g.scores[penalized] -=
        3 +
        (g.bidder !== null &&
        scoreGroup(g.bidder, g.settings.mode) === penalized
          ? g.bid
          : 0);
      g.roundScores = [0, 0, 0, 0];
      g.roundPoints = [0, 0, 0, 0];
      g.phase = "round-end";
      g.winner = null;
      g.turn = null;
      g.violations = [];
      g.notice =
        "Trișarea a fost confirmată. Adversarul este penalizat, iar runda se reface.";
    } else {
      g.scores[penalized] -= 3;
      g.notice =
        "Jucătorul a respectat regulile. Acuzație nefondată: −3 puncte.";
      if (g.phase === "finished") {
        const groups = [
          ...new Set(seats.map((s) => scoreGroup(s, g.settings.mode))),
        ];
        const high = Math.max(...groups.map((i) => g.scores[i]));
        const winners = groups.filter((i) => g.scores[i] === high);
        g.winner =
          high >= g.settings.target && winners.length === 1 ? winners[0] : null;
        if (g.winner === null) g.phase = "round-end";
      }
    }
    return g;
  }
  requireRule(g.turn === seat, "Așteaptă să-ți vină rândul.");
  if (action.kind === "cut") {
    requireRule(g.phase === "cut", "Cărțile au fost deja împărțite.");
    if (action.cut) {
      const at = 1 + Math.min(22, Math.max(0, Math.floor(random() * 23)));
      g.stock.push(...g.stock.splice(0, at));
    }
    const mode = g.settings.mode;
    deal(
      g,
      mode === "duel"
        ? 8
        : mode === "trio-talon"
          ? 7
          : mode === "trio-standard"
            ? 4
            : mode === "four-standard" && action.cut
              ? 3
              : 6,
    );
    // The standard table's accept/cut ritual selects six-card or three-card bidding.
    g.phase = "bidding";
    g.turn = nextSeat(g, g.dealer);
    g.notice =
      "Fiecare licitează o singură dată, în sensul acelor de ceasornic. Un punct licitat înseamnă 33 de puncte de adunat.";
  } else if (action.kind === "bid") {
    requireRule(
      g.phase === "bidding" &&
        Number.isInteger(action.value) &&
        action.value >= 0 &&
        action.value <= 6 &&
        (action.value === 0 || action.value > g.bid),
      "Spune „Pas” sau licitează mai mult decât licitația curentă.",
    );
    g.bids[seat] = action.value;
    if (action.value) {
      g.bid = action.value;
      g.bidder = seat;
    }
    if (seats.every((s) => g.bids[s] !== null)) {
      if (g.bidder === null) return beginCruceRound(g, random);
      g.turn = g.bidder;
      if (
        g.settings.mode === "trio-talon" ||
        g.settings.mode === "trio-standard" ||
        (g.settings.mode === "four-standard" && g.stock.length)
      ) {
        g.phase = "trump";
        g.notice = "Câștigătorul licitației alege tromful.";
      } else {
        g.phase = "playing";
        g.notice = "Ieși cu o carte. Culoarea ei devine tromf.";
      }
    } else g.turn = nextSeat(g, seat);
  } else if (action.kind === "trump") {
    requireRule(
      g.phase === "trump" &&
        Number.isInteger(action.suit) &&
        action.suit >= 0 &&
        action.suit < 4,
      "Alege culoarea tromfului.",
    );
    g.trump = action.suit;
    if (g.settings.mode === "trio-talon") {
      g.hands[seat].push(...g.stock.splice(0));
      g.phase = "exchange";
      g.notice = "Din cele zece cărți, dă câte una fiecărui adversar.";
    } else {
      deal(g, g.settings.mode === "trio-standard" ? 4 : 3, seat);
      g.phase = "playing";
      g.notice = "Tromful a fost ales. Câștigătorul licitației iese primul.";
    }
  } else if (action.kind === "give") {
    requireRule(
      g.phase === "exchange" &&
        seats.includes(action.to) &&
        action.to !== seat &&
        !g.given.includes(action.to) &&
        g.hands[seat].includes(action.card),
      "Dă o carte unui adversar care nu a primit încă una.",
    );
    g.hands[seat] = g.hands[seat].filter((c) => c !== action.card);
    g.hands[action.to].push(action.card);
    g.given.push(action.to);
    if (g.given.length === 2) {
      g.phase = "playing";
      g.notice = "Fiecare are opt cărți. Câștigătorul licitației iese primul.";
    }
  } else if (action.kind === "play") {
    requireRule(
      g.phase === "playing" && g.hands[seat].includes(action.card),
      "Alege o carte din mână.",
    );
    const legal = legalCruceCards(g, seat).includes(action.card);
    requireRule(
      legal || g.settings.cheating,
      "Răspunde la culoare. Dacă nu ai, dă tromf. La iber trebuie să mărești când poți.",
    );
    if (!legal) g.violations.push({ seat, card: action.card, round: g.round });
    if (g.trump === null) g.trump = suitOf(action.card);
    let announcement = 0;
    if (action.announce) {
      requireRule(
        canAnnounce(g, seat, action.card),
        "Poți anunța doar când ieși cu treiarul sau pătrarul și le ai pe amândouă în mână.",
      );
      announcement = suitOf(action.card) === g.trump ? 40 : 20;
      g.announcements[seat] += announcement;
      g.announced.push(suitOf(action.card));
    }
    g.hands[seat] = g.hands[seat].filter((c) => c !== action.card);
    g.trick.push({ seat, card: action.card, announcement });
    g.notice = announcement ? `Anunț de ${announcement} de puncte.` : "";
    if (g.trick.length === seats.length) {
      g.trickWinner = winningCruceCard(g.trick, g.trump)!.seat;
      g.phase = "trick";
      g.turn = null;
    } else g.turn = nextSeat(g, seat);
  } else throw new CruceError("Această acțiune nu este disponibilă acum.");
  return g;
}
export function collectCruceTrick(game: CruceGame): CruceGame {
  requireRule(
    game.phase === "trick" && game.trickWinner !== null,
    "Mâna nu este încă încheiată.",
  );
  const g = structuredClone(game),
    winner = g.trickWinner!;
  g.captured[winner].push(...g.trick.map((p) => p.card));
  g.lastTrick = g.trick;
  g.trick = [];
  if (g.settings.mode === "duel" && g.stock.length) {
    g.hands[winner].push(g.stock.shift()!);
    g.hands[nextSeat(g, winner)].push(g.stock.shift()!);
  }
  if (activeCruceSeats(g.settings.mode).every((s) => !g.hands[s].length))
    scoreRound(g);
  else {
    g.phase = "playing";
    g.turn = winner;
    g.notice = "Jucătorul care a dus mâna iese primul.";
  }
  return g;
}
