// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import CruceBoard from "./CruceBoard";
import { freshCruce, type CruceView } from "../../../packages/shared/cruce";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
it("plays a held pair with an automatic announcement and an ordinary card without one", async () => {
  const view = {
    ...freshCruce({ mode: "duel", target: 11, iber: false, cheating: false }),
    version: 1,
    revision: 7,
    host: 0,
    stockCount: 0,
    deadline: Date.now() + 60000,
    you: 0,
    phase: "playing",
    turn: 0,
    trump: 1,
    hand: [1, 2, 5],
    legalCards: [1, 2, 5],
    handCounts: [3, 0, 3, 0],
    players: [
      { name: "Clau", online: true, ready: false, awayUntil: null },
      null,
      { name: "Ana", online: true, ready: false, awayUntil: null },
      null,
    ],
  } as CruceView;
  const action = vi.fn(async () => null),
    container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <CruceBoard
        view={view}
        connected
        open
        onAction={action}
        onClose={() => {}}
        onLeave={() => {}}
        onSit={async () => true}
      />,
    ),
  );
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  const paired = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Joacă Treiar de roșu"]',
  )!;
  await act(async () => paired.click());
  expect(action).toHaveBeenLastCalledWith(
    { kind: "play", card: 1, announce: true },
    7,
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Joacă As de roșu"]',
      )!
      .click(),
  );
  expect(action).toHaveBeenLastCalledWith(
    { kind: "play", card: 5, announce: false },
    7,
  );
  await act(async () => root.unmount());
});
