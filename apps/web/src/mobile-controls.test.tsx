// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MobileControls } from "./MobileControls";
import { MobileExperience } from "./MobileExperience";
import { installMobileDisplay, useMobileBlocked } from "./mobile-display";
import { mobileKeyDown, subscribeMobileActions } from "./mobile-input";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, container: HTMLDivElement;
let fullscreen: Element | null = null;
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal("navigator", { userAgent: "iPhone", maxTouchPoints: 5 });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreen,
  });
  fullscreen = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const props = {
  enabled: true,
  moving: true,
  busy: false,
  mounted: false,
  prompt: { main: "Cast a line", detail: "", key: "E" as const },
  seatedGame: null,
  onGame() {},
  onStand() {},
  onChat() {},
};
it("keeps the game unloaded before fullscreen, pauses on exit, and preserves the mounted game", async () => {
  const request = vi.fn(async () => {
    fullscreen = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  document.documentElement.requestFullscreen = request;
  function Game() {
    const blocked = useMobileBlocked();
    return (
      <div data-game data-paused={blocked}>
        Game
      </div>
    );
  }
  await act(async () =>
    root.render(
      <MobileExperience>
        <Game />
      </MobileExperience>,
    ),
  );
  expect(container.querySelector("[data-game]")).toBeNull();
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".mobile-start")!.click(),
  );
  expect(request).toHaveBeenCalledOnce();
  const game = container.querySelector("[data-game]");
  expect(game?.getAttribute("data-paused")).toBe("false");
  await act(async () => {
    fullscreen = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  expect(container.querySelector(".mobile-setup")).not.toBeNull();
  expect(container.querySelector("[data-game]")).toBe(game);
  expect(game?.getAttribute("data-paused")).toBe("true");
});
it("offers a usable browser fallback after a rejected fullscreen request", async () => {
  document.documentElement.requestFullscreen = vi.fn(async () => {
    throw new Error("Denied");
  });
  await act(async () =>
    root.render(
      <MobileExperience>
        <div data-game>Game</div>
      </MobileExperience>,
    ),
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".mobile-start")!.click(),
  );
  const browser = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Play in this browser",
  )!;
  expect(browser).toBeDefined();
  await act(async () => browser.click());
  expect(container.querySelector(".mobile-setup")).toBeNull();
  expect(container.querySelector("[data-game]")).not.toBeNull();
});
it.each([true, false])(
  "opens installed=%s Safari without the Fullscreen API",
  async (installed) => {
    vi.stubGlobal("navigator", {
      userAgent: "iPhone",
      maxTouchPoints: 5,
      standalone: installed,
    });
    const descriptor = Object.getOwnPropertyDescriptor(
      document.documentElement,
      "requestFullscreen",
    );
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });
    try {
      await act(async () =>
        root.render(
          <MobileExperience>
            <div data-game>Game</div>
          </MobileExperience>,
        ),
      );
      if (installed) {
        expect(container.querySelector(".mobile-start")?.textContent).toContain(
          "Enter La Baraj",
        );
        expect(container.textContent).not.toContain(
          "This browser cannot open fullscreen",
        );
        expect(container.textContent).not.toContain("Play in this browser");
        await act(async () =>
          container.querySelector<HTMLButtonElement>(".mobile-start")!.click(),
        );
      } else {
        expect(container.textContent).toContain(
          "This browser cannot open fullscreen",
        );
        const browser = [...container.querySelectorAll("button")].find(
          (b) => b.textContent === "Play in this browser",
        );
        expect(browser).toBeDefined();
        await act(async () => browser!.click());
      }
      expect(container.querySelector(".mobile-setup")).toBeNull();
      expect(container.querySelector("[data-game]")).not.toBeNull();
    } finally {
      if (descriptor)
        Object.defineProperty(
          document.documentElement,
          "requestFullscreen",
          descriptor,
        );
      else
        Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    }
  },
);
it("retains the native install prompt and only invokes it after an install tap", async () => {
  installMobileDisplay();
  const prompt = vi.fn(async () => {});
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  await act(async () => window.dispatchEvent(event));
  await act(async () =>
    root.render(
      <MobileExperience>
        <div />
      </MobileExperience>,
    ),
  );
  expect(event.defaultPrevented).toBe(true);
  expect(prompt).not.toHaveBeenCalled();
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Install La Baraj"),
  )!;
  await act(async () => button.click());
  expect(prompt).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("After installation, open La Baraj");
});

it("exposes fishing beside a bench without replacing the sit action", async () => {
  const action = vi.fn();
  const off = subscribeMobileActions(action);
  await act(async () =>
    root.render(
      <MobileControls
        {...props}
        prompt={{
          main: "Sit · Fishing bench",
          detail: "E to cast a line",
          key: "F",
          secondary: { main: "Cast a line", key: "E" },
        }}
      />,
    ),
  );
  expect(container.querySelector(".mobile-context")?.textContent).toBe(
    "Sit · Fishing bench",
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".mobile-secondary")!.click(),
  );
  expect(action.mock.calls[0][0].code).toBe("KeyE");
  expect(action.mock.calls[0][0].source).toBe("touch");
  off();
});

it("mounts one library joystick per zone through StrictMode and repeated remounts", async () => {
  const { StrictMode } = await import("react");
  for (let cycle = 0; cycle < 3; cycle++) {
    await act(async () =>
      root.render(
        <StrictMode>
          <MobileControls {...props} />
        </StrictMode>,
      ),
    );
    await vi.waitFor(() =>
      expect(
        container.querySelectorAll(".mobile-stick-zone .joystick"),
      ).toHaveLength(2),
    );
    expect(container.querySelectorAll("button.mobile-stick")).toHaveLength(0);
    await act(async () => root.render(null));
    expect(container.querySelectorAll(".joystick")).toHaveLength(0);
  }
});
