import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CruceBoard from "./CruceBoard";
import { CruceTurnStatus } from "./CruceTurnStatus";
import { CruceTable } from "../../server/cruce-table";
import { freshCruce, type CruceView } from "../../../packages/shared/cruce";
function render(view: CruceView, connected = true) {
  return renderToStaticMarkup(
    <CruceBoard
      view={view}
      connected={connected}
      open
      onAction={async () => null}
      onClose={() => {}}
      onLeave={() => {}}
      onSit={async () => true}
    />,
  );
}
describe("Cruce board privacy and affordances", () => {
  it("gives spectators seat actions and no private cards or live-play controls", () => {
    const html = render(new CruceTable({ save: async () => {} }).view(null));
    expect(html.match(/Ocupă locul/g)).toHaveLength(4);
    expect(html).not.toContain('aria-label="Cărțile tale"');
    expect(html).not.toContain("Pregătit");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Creează masă");
    expect(html).not.toContain("Codul secret");
  });
  it("puts the actor/dealer/visible soft timer in the table center and removes generic table tutorial prose", () => {
    const v = {
      ...freshCruce(),
      version: 1,
      revision: 1,
      stockCount: 0,
      host: 0,
      you: 0,
      phase: "playing",
      turn: 0,
      dealer: 2,
      round: 1,
      deadline: Date.now() - 5000,
      turnOverdue: true,
      notice: "Jucătorul care a dus mâna iese primul.",
      hand: [],
      legalCards: [],
      handCounts: [0, 0, 0, 0],
      players: [
        { name: "Clau", online: true, ready: false, awayUntil: null },
        null,
        { name: "Ana", online: true, ready: false, awayUntil: null },
        null,
      ],
    } as CruceView;
    const html = render(v);
    expect(html).toContain("Tu joci");
    expect(html).toContain("Împarte: Ana");
    expect(html).toContain("Poți juca în continuare");
    expect(html).not.toContain(v.notice);
    expect(html.indexOf('aria-label="Starea mesei"')).toBeLessThan(
      html.indexOf('aria-label="Scor, stare și comenzi"'),
    );
    const paused = renderToStaticMarkup(
      <CruceTurnStatus view={v} connected={false} now={Date.now()} />,
    );
    expect(paused).toContain("Conexiune întreruptă");
    expect(paused).not.toContain('role="timer"');
  });
  it("uses Arabic bid labels and shows the winning bidder's call below their name", () => {
    const v = {
      ...freshCruce(),
      version: 1,
      revision: 1,
      stockCount: 0,
      host: 0,
      deadline: Date.now() + 60000,
      you: 0,
      phase: "bidding",
      turn: 0,
      bid: 3,
      bidder: 2,
      bids: [null, null, 3, null],
      hand: [],
      legalCards: [],
      handCounts: [0, 0, 0, 0],
      players: [
        { name: "Clau", online: true, ready: false, awayUntil: null },
        null,
        { name: "Ana", online: true, ready: false, awayUntil: null },
        null,
      ],
    } as CruceView;
    const html = render(v);
    expect(html).toContain('aria-label="Ana a strigat 3"');
    expect(html).toContain("<strong>6</strong>");
    expect(html).not.toContain("<strong>VI</strong>");
  });
  it("only enables legal held cards and preserves their complete accessible identities", async () => {
    const table = new CruceTable({ save: async () => {} });
    const actor = { owner: "x", socket: "x", name: "Clau" };
    await table.join(actor, 0);
    const view = {
      ...table.view(actor),
      ...freshCruce(),
      phase: "playing",
      you: 0,
      turn: 0,
      hand: [5, 11],
      handCounts: [2, 2, 2, 2],
      legalCards: [5],
    } as CruceView;
    const html = render(view);
    expect(html).toContain('aria-label="Joacă As de roșu"');
    expect(html).toMatch(/disabled=""[^>]*aria-label="Joacă As de dubă"/);
    expect(html).not.toMatch(/disabled=""[^>]*aria-label="Joacă As de roșu"/);
    expect(render(view, false)).toMatch(
      /disabled=""[^>]*aria-label="Joacă As de roșu"/,
    );
  });
});
