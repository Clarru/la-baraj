import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isMobileDevice } from "./device-access";
import App from "./App";

afterEach(() => vi.unstubAllGlobals());
describe("mobile device detection and entry", () => {
  it.each([
    {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile",
    },
    { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome Mobile" },
    { userAgent: "Mozilla/5.0 (Linux; Android 14; Tablet) Chrome" },
    {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari",
      platform: "MacIntel",
      maxTouchPoints: 5,
    },
    { userAgent: "Unknown", userAgentData: { mobile: true } },
  ])("identifies phones and tablets: %o", (device) => {
    expect(isMobileDevice(device)).toBe(true);
  });
  it.each([
    {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome",
      maxTouchPoints: 10,
    },
    {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari",
      platform: "MacIntel",
      maxTouchPoints: 0,
    },
    {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox",
      userAgentData: { mobile: false },
    },
  ])("keeps computers usable, including touch-enabled PCs: %o", (device) => {
    expect(isMobileDevice(device)).toBe(false);
  });
  it("offers mobile fullscreen and installation setup before loading a saved game", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone) Mobile" });
    vi.stubGlobal("localStorage", { getItem: () => "Saved player" });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Play in fullscreen");
    expect(html).toContain("Add La Baraj to your Home Screen");
    expect(html).not.toContain("Join us on a computer");
    expect(html).not.toContain("Loading the lake");
  });
});
