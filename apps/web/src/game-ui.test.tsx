import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ControlsHelp, GameHeader, GameMenu } from "./GameMenu";
import { captureGameKey, type GameInputState } from "./game-input";
import type { MultiplayerRoom, NetworkStatus } from "./multiplayer";
import { Minimap } from "./Minimap";
import { createNavigationFeed } from "./navigation-feed";
const idle: GameInputState = {
  panel: null,
  homeView: false,
  indoors: false,
  typing: false,
};
function key(code: string, value = code) {
  return {
    code,
    key: value,
    repeat: false,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  };
}
const noop = () => {};
function room(
  status: NetworkStatus = "online",
  count = 12,
  error = "",
  errorCode: string | null = null,
) {
  const view = {
    status,
    count,
    error,
    errorCode,
    homeIndex: 7,
    nickname: "Quiet Otter",
  };
  return {
    subscribe: () => noop,
    getSnapshot: () => view,
    attachDiagnostics: noop,
  } as unknown as MultiplayerRoom;
}
afterEach(() => vi.unstubAllEnvs());
describe("production world interface", () => {
  it("keeps the minimap free of visible labels, controls and hide actions", () => {
    const html = renderToStaticMarkup(
      <Minimap
        homeIndex={7}
        navigation={createNavigationFeed({ x: 10, z: 20, heading: 0 })}
      />,
    );
    expect(html).toContain('data-testid="minimap"');
    expect(html).toContain('data-testid="player-map-marker"');
    expect(html).toContain('data-testid="home-map-marker"');
    expect(html).not.toMatch(
      /<header|<footer|<button|<a |map-north|map-legend|Show map|Hide map/,
    );
  });
  it("shows the real brand, a single online count and Menu without prototype or invitation controls", () => {
    vi.stubEnv("DEV", false);
    const html = renderToStaticMarkup(
      <GameHeader room={room()} menuOpen={false} onMenu={noop} />,
    );
    expect(html).toContain("/assets/brand/la-baraj-banner.webp");
    expect(html).toContain('alt="La Baraj"');
    expect(html).toContain("12 online");
    expect(html).toContain("Open menu");
    expect((html.match(/<button/g) ?? []).length).toBe(1);
    expect(html).not.toMatch(
      /Copy invite|\/30|\/50|World Test|WORLD TEST|Survey|Coverage|inventory|fps|local prototype|multiplayer-metrics/i,
    );
  });
  it("keeps connection recovery available without displaying capacity", () => {
    const full = renderToStaticMarkup(
      <GameHeader room={room("full", 50)} menuOpen={false} onMenu={noop} />,
    );
    expect(full).toContain("World is busy");
    expect(full).toContain("Retry");
    expect(full.replace(/<[^>]*>/g, "")).not.toMatch(
      /\b50\b|\b30\b|maximum|players full/,
    );
    const reconnecting = renderToStaticMarkup(
      <GameHeader
        room={room("reconnecting", 0)}
        menuOpen={false}
        onMenu={noop}
      />,
    );
    expect(reconnecting).toContain("Reconnecting");
  });
  it("preserves actionable cabin and storage errors instead of offering a pointless retry", () => {
    const full = renderToStaticMarkup(
      <GameHeader
        room={room(
          "error",
          0,
          "A cabin is not available right now.",
          "homes-full",
        )}
        menuOpen={false}
        onMenu={noop}
      />,
    );
    expect(full).toContain("A cabin is not available right now.");
    expect(full).toContain("Please ask the host for help.");
    expect(full).not.toContain(">Retry<");
    const invalid = renderToStaticMarkup(
      <GameHeader
        room={room(
          "error",
          0,
          "Try again from your usual browser.",
          "invalid-resume",
        )}
        menuOpen={false}
        onMenu={noop}
      />,
    );
    expect(invalid).toContain("Try again from your usual browser.");
    expect(invalid).not.toContain(">Retry<");
    const storage = renderToStaticMarkup(
      <GameHeader
        room={room(
          "error",
          0,
          "Your cabin could not be saved.",
          "storage-unavailable",
        )}
        menuOpen={false}
        onMenu={noop}
      />,
    );
    expect(storage).toContain("Your cabin could not be saved.");
    expect(storage).toContain(">Retry<");
  });
  it("puts only real player actions and the assigned cabin in the menu", () => {
    const html = renderToStaticMarkup(
      <GameMenu
        nickname="Quiet Otter"
        homeIndex={7}
        onRename={noop}
        onControls={noop}
        onHome={noop}
        onReset={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain('name="nickname"');
    for (const label of [
      "Your cabin · 08",
      "Controls",
      "Look at your cabin",
      "Return to your cabin",
    ])
      expect(html).toContain(label);
    expect(html).not.toMatch(
      /Invite|Survey|Settings|Texture|stress|coverage|rendering/i,
    );
    const help = renderToStaticMarkup(
      <ControlsHelp onClose={noop} onMenu={noop} />,
    );
    expect(help).toContain("Jump");
    expect(help).toContain("Shift to the next seat");
    expect(help).toContain("park");
  });
  it("captures Escape before a door can exit and lets nickname typing keep its native defaults", () => {
    const escape = key("Escape");
    expect(
      captureGameKey(escape, {
        ...idle,
        panel: "menu",
        indoors: true,
        typing: true,
      }),
    ).toBe("close-panel");
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(escape.stopImmediatePropagation).toHaveBeenCalledOnce();
    for (const code of ["KeyW", "KeyE", "KeyF", "KeyV", "KeyR", "Space"]) {
      const typing = key(code);
      expect(
        captureGameKey(typing, { ...idle, panel: "menu", typing: true }),
      ).toBe("block");
      expect(typing.stopImmediatePropagation).toHaveBeenCalledOnce();
      expect(typing.preventDefault).not.toHaveBeenCalled();
    }
  });
  it("keeps the map permanent, closes UI before gameplay, and returns home view to walking", () => {
    expect(captureGameKey(key("KeyM"), idle)).toBe("pass");
    expect(captureGameKey(key("Slash", "?"), idle)).toBe("controls");
    expect(captureGameKey(key("Escape"), { ...idle, indoors: true })).toBe(
      "pass",
    );
    const walk = key("KeyW");
    expect(captureGameKey(walk, { ...idle, homeView: true })).toBe("walk");
    expect(walk.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(captureGameKey(key("KeyH"), { ...idle, indoors: true })).toBe(
      "pass",
    );
    for (const code of ["Digit1", "Digit6", "KeyC", "KeyP"])
      expect(captureGameKey(key(code), idle)).toBe("pass");
  });
});
