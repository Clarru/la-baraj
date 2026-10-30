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

function lobbyView(): CruceView {
  return {
    ...freshCruce(),
    version: 1,
    revision: 2,
    you: 0,
    host: 0,
    deadline: null,
    hand: [],
    legalCards: [],
    stockCount: 0,
    handCounts: [0, 0, 0, 0],
    players: [
      { name: "Clau", online: true, ready: false, awayUntil: null },
      null,
      { name: "Ana", online: true, ready: false, awayUntil: null },
      null,
    ],
  };
}
it("saves a selected rule immediately, blocks rapid Ready until authoritative confirmation and uses its new revision", async () => {
  let resolveSave!: (value: string | null) => void;
  const save = new Promise<string | null>((resolve) => {
    resolveSave = resolve;
  });
  const action = vi.fn(() => save),
    container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container),
    v = lobbyView();
  const render = (view: CruceView) => (
    <CruceBoard
      view={view}
      connected
      open
      onAction={action}
      onClose={() => {}}
      onLeave={() => {}}
      onSit={async () => true}
    />
  );
  await act(async () => root.render(render(v)));
  const mode = container.querySelector<HTMLSelectElement>(
    ".cruce-settings select",
  )!;
  await act(async () => {
    mode.value = "duel";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(action).toHaveBeenCalledWith(
    { kind: "configure", settings: { ...v.settings, mode: "duel" } },
    2,
  );
  const ready = () =>
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Pregătit",
    )!;
  expect(ready().disabled).toBe(true);
  expect(mode.disabled).toBe(true);
  expect(container.textContent).not.toContain("Aplică regulile");
  await act(async () => ready().click());
  expect(action).toHaveBeenCalledTimes(1);
  await act(async () => {
    root.render(
      render({ ...v, settings: { ...v.settings, mode: "duel" }, revision: 3 }),
    );
    resolveSave(null);
  });
  expect(ready().disabled).toBe(false);
  expect(mode.value).toBe("duel");
  await act(async () => ready().click());
  expect(action).toHaveBeenLastCalledWith({ kind: "ready" }, 3);
  await act(async () => root.unmount());
});
it("keeps authoritative settings and an error when automatic configuration fails", async () => {
  const v = lobbyView(),
    action = vi.fn(async () => "Regulile nu au putut fi salvate."),
    container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <CruceBoard
        view={v}
        connected
        open
        onAction={action}
        onClose={() => {}}
        onLeave={() => {}}
        onSit={async () => true}
      />,
    ),
  );
  const mode = container.querySelector<HTMLSelectElement>(
    ".cruce-settings select",
  )!;
  await act(async () => {
    mode.value = "duel";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(mode.value).toBe(v.settings.mode);
  expect(container.querySelector('[role="alert"]')!.textContent).toContain(
    "nu au putut fi salvate",
  );
  expect(
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Pregătit",
    )!.disabled,
  ).toBe(true);
  expect(action).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});
it("places bidding above the own username, shows every called level without conversion and rotates cards by own compass", async () => {
  for (const mode of ["duel", "trio-standard", "four-standard"] as const) {
    const active =
      mode === "duel"
        ? [0, 2]
        : mode === "trio-standard"
          ? [0, 1, 2]
          : [0, 1, 2, 3];
    for (const you of active) {
      const v = {
        ...lobbyView(),
        settings: { ...lobbyView().settings, mode },
        phase: "bidding",
        you,
        turn: you,
        bid: 2,
        bidder: active[0],
        bids: [1, 2, 2, 1],
        trick: active.map((seat) => ({
          seat,
          card: seat,
          announcement: seat === you ? 20 : 0,
        })),
        players: [0, 1, 2, 3].map((seat) =>
          active.includes(seat)
            ? {
                name: `Player${seat}`,
                online: true,
                ready: false,
                awayUntil: null,
              }
            : null,
        ),
      } as CruceView;
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      await act(async () =>
        root.render(
          <CruceBoard
            view={v}
            connected
            open
            onAction={async () => null}
            onClose={() => {}}
            onLeave={() => {}}
            onSit={async () => true}
          />,
        ),
      );
      const own = container.querySelector(".cruce-player--you")!;
      expect(own.classList.contains("cruce-player--0")).toBe(true);
      expect(own.querySelector(".cruce-auction")).not.toBeNull();
      expect(container.querySelector(".cruce-sidebar .cruce-bids")).toBeNull();
      expect(
        container.querySelectorAll(".cruce-auction .cruce-bids button"),
      ).toHaveLength(7);
      for (const card of container.querySelectorAll(".cruce-played")) {
        const seat = Number(
          card.getAttribute("aria-label")!.match(/Player(\d)/)![1],
        );
        expect(
          card.classList.contains(`cruce-played--${(seat - you + 4) % 4}`),
        ).toBe(true);
      }
      for (const call of container.querySelectorAll(".cruce-call"))
        expect(call.textContent).not.toContain("·");
      await act(async () => root.unmount());
      container.remove();
    }
  }
});
