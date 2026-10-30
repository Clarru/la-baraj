import { describe, expect, it } from "vitest";
import {
  activeCruceSeats,
  beginCruceRound,
  canAnnounce,
  cardPoints,
  collectCruceTrick,
  CRUCE_MODES,
  freshCruce,
  legalCruceCards,
  moveCruce,
  scoreGroup,
  winningCruceCard,
  type CruceGame,
  type CruceMode,
  type CruceSeat,
} from "../packages/shared/cruce";
function random(seed = 5) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function start(mode: CruceMode, cut = true) {
  let g = beginCruceRound(
    freshCruce({ mode, target: 11, iber: false, cheating: false }),
    random(),
  );
  g = moveCruce(g, g.turn!, { kind: "cut", cut });
  let first = true;
  while (g.phase === "bidding") {
    g = moveCruce(g, g.turn!, { kind: "bid", value: first ? 1 : 0 });
    first = false;
  }
  if (g.phase === "trump")
    g = moveCruce(g, g.turn!, { kind: "trump", suit: 0 });
  while (g.phase === "exchange") {
    const to = activeCruceSeats(mode).find(
      (s) => s !== g.turn && !g.given.includes(s),
    )!;
    g = moveCruce(g, g.turn!, { kind: "give", to, card: g.hands[g.turn!][0] });
  }
  return g;
}
const playAll = (game: CruceGame) => {
  let g = game,
    turns = 0;
  while (["playing", "trick"].includes(g.phase)) {
    if (g.phase === "trick") g = collectCruceTrick(g);
    else {
      const card = legalCruceCards(g, g.turn!)[0];
      g = moveCruce(g, g.turn!, {
        kind: "play",
        card,
        announce: canAnnounce(g, g.turn!, card),
      });
      turns++;
    }
    if (turns > 24) throw Error("Deck failed to terminate");
  }
  return g;
};
describe("Cruce rules", () => {
  it("has exactly 24 cards totaling 120 points and partners opposite", () => {
    expect(
      Array.from({ length: 24 }, (_, c) => cardPoints(c)).reduce(
        (a, b) => a + b,
      ),
    ).toBe(120);
    expect(scoreGroup(0, "four-classic")).toBe(scoreGroup(2, "four-classic"));
    expect(scoreGroup(1, "four-classic")).toBe(scoreGroup(3, "four-classic"));
    expect(scoreGroup(1, "four-individual")).not.toBe(
      scoreGroup(3, "four-individual"),
    );
  });
  for (const mode of CRUCE_MODES)
    for (const cut of [false, true])
      it(`plays all 24 cards once: ${mode}, cut ${cut}`, () => {
        const g = playAll(start(mode, cut));
        expect(g.phase).toBe("round-end");
        expect(g.captured.flat()).toHaveLength(24);
        expect(new Set(g.captured.flat()).size).toBe(24);
        expect(g.roundPoints.reduce((a, b) => a + b)).toBe(
          120 + g.announcements.reduce((a, b) => a + b),
        );
        expect(g.hands.flat()).toEqual([]);
        expect(g.stock).toEqual([]);
      });
  it("cuts to 3-card bidding, accepts to 6-card bidding in standard teams", () => {
    const g = beginCruceRound(freshCruce(), random());
    expect(
      moveCruce(g, g.turn!, { kind: "cut", cut: true }).hands.map(
        (h) => h.length,
      ),
    ).toEqual([3, 3, 3, 3]);
    expect(
      moveCruce(g, g.turn!, { kind: "cut", cut: false }).hands.map(
        (h) => h.length,
      ),
    ).toEqual([6, 6, 6, 6]);
  });
  it("trio talon gives one card to each opponent and finishes with eight each", () => {
    const g = start("trio-talon");
    expect(g.hands.map((h) => h.length)).toEqual([8, 8, 8, 0]);
    expect(g.given).toHaveLength(2);
    expect(new Set(g.given).size).toBe(2);
  });
  it("all passes redeal and rotate the dealer without changing scores", () => {
    let g = beginCruceRound(freshCruce(), random());
    const dealer = g.dealer;
    g = moveCruce(g, g.turn!, { kind: "cut", cut: true });
    for (let i = 0; i < 4; i++)
      g = moveCruce(g, g.turn!, { kind: "bid", value: 0 }, random());
    expect(g.phase).toBe("cut");
    expect(g.dealer).not.toBe(dealer);
    expect(g.scores).toEqual([0, 0, 0, 0]);
  });
  it("orders nine below Unter and Ace above Ten, and only trump beats a different led suit", () => {
    const trick = (cards: number[]) =>
      cards.map((card, i) => ({ card, seat: i as CruceSeat, announcement: 0 }));
    expect(winningCruceCard(trick([3, 0, 1, 2]), 3)?.card).toBe(2);
    expect(winningCruceCard(trick([4, 5, 11]), 2)?.card).toBe(5);
    expect(winningCruceCard(trick([5, 21, 22]), 3)?.card).toBe(22);
  });
  it("forces suit, then trump, then free discard; iber only overcalls the led suit", () => {
    const g = start("four-classic");
    g.stock = [];
    g.trump = 1;
    g.trick = [{ seat: 1, card: 1, announcement: 0 }];
    g.hands[0] = [0, 5, 6, 17];
    expect(legalCruceCards(g, 0)).toEqual([0, 5]);
    g.settings.iber = true;
    expect(legalCruceCards(g, 0)).toEqual([5]);
    g.trick.push({ seat: 2, card: 6, announcement: 0 });
    expect(legalCruceCards(g, 0)).toEqual([0, 5]);
    g.hands[0] = [6, 17];
    expect(legalCruceCards(g, 0)).toEqual([6]);
    g.hands[0] = [17];
    expect(legalCruceCards(g, 0)).toEqual([17]);
  });
  it("duel is free while drawing, then enforces suit/trump after stock depletion", () => {
    const g = start("duel");
    g.hands[0] = [0, 7];
    g.trump = 1;
    g.trick = [{ seat: 2, card: 5, announcement: 0 }];
    expect(legalCruceCards(g, 0)).toEqual([0, 7]);
    g.stock = [];
    expect(legalCruceCards(g, 0)).toEqual([0]);
  });
  it("only a led Ober or King can announce a held pair; scores 20 or 40", () => {
    const g = start("four-classic");
    g.turn = 0;
    g.hands[0] = [1, 2, 7, 8];
    g.trump = 1;
    expect(
      moveCruce(g, 0, { kind: "play", card: 1, announce: true })
        .announcements[0],
    ).toBe(20);
    expect(
      moveCruce(g, 0, { kind: "play", card: 8, announce: true })
        .announcements[0],
    ).toBe(40);
    g.trick = [{ seat: 1, card: 6, announcement: 0 }];
    expect(() =>
      moveCruce(g, 0, { kind: "play", card: 7, announce: true }),
    ).toThrow(/anunța/);
  });
  it("rejects an illegal play atomically; cheating records offences privately for later accusations", () => {
    const g = start("four-classic");
    g.turn = 0;
    g.trump = 1;
    g.hands[0] = [0, 17];
    g.trick = [{ seat: 3, card: 1, announcement: 0 }];
    const before = structuredClone(g);
    expect(() =>
      moveCruce(g, 0, { kind: "play", card: 17, announce: false }),
    ).toThrow(/culoare/);
    expect(g).toEqual(before);
    g.settings.cheating = true;
    const cheated = moveCruce(g, 0, {
      kind: "play",
      card: 17,
      announce: false,
    });
    expect(cheated.violations).toHaveLength(1);
    const caught = moveCruce(cheated, 1, { kind: "accuse", seat: 0 });
    expect(caught.phase).toBe("round-end");
    expect(caught.scores[0]).toBe(-4);
    expect(moveCruce(g, 1, { kind: "accuse", seat: 0 }).scores[1]).toBe(-3);
  });
  it("a failed bidder loses exactly the bid while the opponents keep earned points", () => {
    let g = start("four-classic");
    g.bid = 6;
    g = playAll(g);
    expect(g.roundScores[scoreGroup(g.bidder!, g.settings.mode)]).toBe(-6);
  });
});
