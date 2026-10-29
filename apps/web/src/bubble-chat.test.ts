import { describe, expect, it } from "vitest";
import {
  BUBBLE_CHAT_MAX_CHARS,
  isBubbleText,
  normalizeBubbleText,
} from "../../../packages/shared/bubble-chat";

describe("temporary two-line chat", () => {
  it("rolls the oldest line away when a third line is started", () => {
    expect(normalizeBubbleText("first\nsecond\n")).toBe("second\n");
    expect(normalizeBubbleText("first\nsecond\nthird")).toBe("second\nthird");
  });
  it("supports Unicode while bounding input and stripping control characters", () => {
    expect(normalizeBubbleText("Salut 👋\nce faci?")).toBe(
      "Salut 👋\nce faci?",
    );
    expect(normalizeBubbleText("ok\tbad\u0000")).toBe("okbad");
    expect(normalizeBubbleText("😀".repeat(200)).length).toBeLessThanOrEqual(
      BUBBLE_CHAT_MAX_CHARS,
    );
    expect(isBubbleText("a\nb\nc")).toBe(false);
    expect(isBubbleText("ok\tbad")).toBe(false);
    expect(isBubbleText("x".repeat(BUBBLE_CHAT_MAX_CHARS + 1))).toBe(false);
  });
});
