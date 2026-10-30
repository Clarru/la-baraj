import { describe, expect, it } from "vitest";
import { normalizeChatDraft } from "./bubble-chat-input";
import { isBubbleText } from "../../../packages/shared/bubble-chat";

describe("chat drafts without empty leading lines", () => {
  it.each(["\n", "\n\n", " \n", "\r\n\r\n"])(
    "keeps Shift+Enter on an empty draft on the first line: %j",
    (value) => expect(normalizeChatDraft(value)).toBe(""),
  );

  it("ignores repeated Shift+Enter on the empty second line without losing text", () => {
    expect(normalizeChatDraft("hello\n")).toBe("hello\n");
    expect(normalizeChatDraft("hello\n\n\n")).toBe("hello\n");
    expect(normalizeChatDraft("hello\n \n")).toBe("hello\n");
  });

  it("removes leading and interior blank lines, including pasted CRLF text", () => {
    expect(normalizeChatDraft("\n \nhello")).toBe("hello");
    expect(normalizeChatDraft("\r\nhello\r\n \r\nworld")).toBe("hello\nworld");
    expect(normalizeChatDraft("\u0000\nhello")).toBe("hello");
  });

  it("keeps the newest two populated lines and existing wire limits", () => {
    expect(normalizeChatDraft("first\nsecond\nthird")).toBe("second\nthird");
    expect(normalizeChatDraft("first\nsecond\n")).toBe("second\n");
    const text = normalizeChatDraft("Salut 👋\n" + "😀".repeat(100));
    expect(text).toContain("Salut 👋\n");
    expect(isBubbleText(text)).toBe(true);
  });
});
