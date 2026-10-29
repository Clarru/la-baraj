import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CruceBoard from "./CruceBoard";
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
