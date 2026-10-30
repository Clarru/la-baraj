import { normalizeBubbleText } from "../../../packages/shared/bubble-chat";

/** Allow a second line for typing, but never spend a line on empty padding. */
export function normalizeChatDraft(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const compact = lines
    .filter((line, index) => line.trim() || index === lines.length - 1)
    .join("\n");
  return normalizeBubbleText(compact).replace(/^(?:[^\S\n]*\n)+/u, "");
}
