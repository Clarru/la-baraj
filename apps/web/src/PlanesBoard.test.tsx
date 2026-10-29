import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PlanesBoard from "./PlanesBoard";
import { randomFleet, type PlanesView } from "../../../packages/shared/planes";

function view(): PlanesView {
  return {
    version: 1,
    revision: 2,
    round: 0,
    phase: "setup",
    players: [
      {
        name: "Alice",
        online: true,
        ready: false,
        remaining: 3,
        awayUntil: null,
      },
      { name: "Bob", online: true, ready: true, remaining: 3, awayUntil: null },
    ],
    you: 0,
    ownPlanes: randomFleet(() => 0.3),
    shots: [[], []],
    turn: null,
    winner: null,
    deadline: Date.now() + 120000,
    reason: null,
    event: null,
  };
}
function render(state: PlanesView, open = true, connected = true) {
  return renderToStaticMarkup(
    <PlanesBoard
      view={state}
      open={open}
      connected={connected}
      onAction={async () => null}
      onClose={() => {}}
      onLeave={() => {}}
    />,
  );
}
function readyButton(html: string) {
  return html.match(/<button[^>]*class="planes-ready"[^>]*>/)?.[0];
}
describe("paper-game interaction boundaries", () => {
  it("keeps the seated board mounted but hidden while folded", () => {
    const html = render(view(), false);
    expect(html).toContain('hidden=""');
    expect(html).toContain('data-testid="planes-board"');
    expect(html).toContain("Your plane placement grid");
  });
  it("uses clear plane labels and reserves the error space before a move fails", () => {
    const state = view();
    const setup = render(state);
    expect(setup).toContain("Your planes");
    expect(setup).toContain("How to play");
    expect(setup).toContain('class="planes-error" role="alert"');
    expect(setup).not.toContain("Your sky");
    state.phase = "playing";
    state.turn = 0;
    const battle = render(state);
    expect(battle).toContain("Bob&#x27;s planes");
    expect(battle).toContain("Your planes");
    expect(battle).not.toContain("sky");
  });
  it("enables Ready only while an opponent is online and present", () => {
    const state = view();
    expect(readyButton(render(state))).not.toContain("disabled");
    state.players[1]!.online = false;
    state.players[1]!.awayUntil = Date.now() + 30000;
    expect(readyButton(render(state))).toContain("disabled");
    expect(render(state)).toContain("Bob is reconnecting");
    state.players[1] = null;
    expect(readyButton(render(state))).toContain("disabled");
    expect(readyButton(render(view(), true, false))).toContain("disabled");
  });
  it("renders spectators only public grids even if an accidental own-fleet field is supplied", () => {
    const state = view();
    state.you = null;
    const html = render(state);
    expect(html).toContain("Alice&#x27;s shots");
    expect(html).toContain("Hidden planes stay private");
    expect(html).not.toContain("paper-cell--cockpit");
    expect(html).not.toContain("Your private fleet");
    expect(html).not.toContain("planes-ready");
  });
  it("disables every target when it is the opponent's turn", () => {
    const state = view();
    state.phase = "playing";
    state.turn = 1;
    const html = render(state);
    expect(
      (html.match(/<button[^>]+class="paper-cell[^>]+disabled=""/g) ?? [])
        .length,
    ).toBe(100);
    expect(html).toContain("Bob is thinking");
    state.turn = 0;
    expect(
      (
        render(state).match(/<button[^>]+class="paper-cell[^>]+disabled=""/g) ??
        []
      ).length,
    ).toBe(0);
  });
  it("keeps hit and revealed squares unavailable after a plane is downed", () => {
    const state = view();
    state.phase = "playing";
    state.turn = 0;
    state.shots[0] = [
      { x: 4, y: 1, result: "head", revealed: { x: 4, y: 1, rotation: 0 } },
    ];
    const html = render(state);
    expect(html).toMatch(/<button[^>]+aria-label="E2 · head"[^>]+disabled=""/);
    expect(html).toMatch(
      /<button[^>]+aria-label="C3 · downed"[^>]+disabled=""/,
    );
    expect(html).toMatch(/<button[^>]+aria-label="A1"(?![^>]*disabled)[^>]*>/);
  });
});
