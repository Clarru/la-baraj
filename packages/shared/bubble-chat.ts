export const BUBBLE_CHAT_MAX_CHARS = 180;
export const BUBBLE_CHAT_IDLE_MS = 5000;

/** Keep the newest two explicit lines and preserve ordinary Unicode text. */
export function normalizeBubbleText(text: string) {
  const cleaned = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\p{Cc}\p{Cs}\u2028\u2029]/gu, (char) =>
      char === "\n" ? "\n" : "",
    );
  const lastLines = cleaned.split("\n").slice(-2).join("\n");
  // Count UTF-16 units for the wire limit without splitting surrogate pairs.
  let result = "";
  for (const char of lastLines) {
    if (result.length + char.length > BUBBLE_CHAT_MAX_CHARS) break;
    result += char;
  }
  return result;
}
export function isBubbleText(text: unknown): text is string {
  return (
    typeof text === "string" &&
    text.length <= BUBBLE_CHAT_MAX_CHARS &&
    text.split("\n").length <= 2 &&
    normalizeBubbleText(text) === text
  );
}
