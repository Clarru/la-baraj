// @vitest-environment jsdom
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MobileChatComposer, focusMobileChat } from "./MobileChatComposer";
import { useBubbleChat } from "./use-bubble-chat";
import type { MultiplayerRoom } from "./multiplayer";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const publishChat = vi.fn();
const room = { publishChat } as unknown as MultiplayerRoom;
let focusedBeforeTapReturned = false;
function Fixture() {
  const [mode, setMode] = useState<"closed" | "editing" | "display">("closed");
  const input = useRef<HTMLTextAreaElement>(null);
  const draft = useBubbleChat(
    room,
    mode !== "closed",
    mode === "editing",
    () => setMode("display"),
    () => setMode("closed"),
    true,
  );
  return (
    <>
      <button
        onClick={() => {
          focusMobileChat(input, () => setMode("editing"));
          focusedBeforeTapReturned = document.activeElement === input.current;
        }}
      >
        Chat
      </button>
      <MobileChatComposer
        inputRef={input}
        editing={mode === "editing"}
        draft={draft}
      />
    </>
  );
}
const field = () =>
  document.querySelector<HTMLTextAreaElement>("[data-mobile-chat-input]")!;
function type(value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!.call(field(), value);
  field().dispatchEvent(new Event("input", { bubbles: true }));
}
beforeEach(async () => {
  vi.useFakeTimers();
  publishChat.mockClear();
  focusedBeforeTapReturned = false;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Fixture />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("focuses the already-mounted DOM input before a single Chat tap returns", async () => {
  const node = field();
  expect(node.closest("form")!.hidden).toBe(true);
  await act(async () => host.querySelector("button")!.click());
  expect(focusedBeforeTapReturned).toBe(true);
  expect(document.activeElement).toBe(node);
  expect(node.closest("form")!.hidden).toBe(false);
  await act(async () => vi.advanceTimersByTime(6000));
  expect(document.activeElement).toBe(node);
  expect(node.closest("form")!.hidden).toBe(false);
});
it("publishes the shared rolling draft, sends once, blurs and reuses the same input", async () => {
  await act(async () => host.querySelector("button")!.click());
  const node = field();
  await act(async () => type("hello"));
  await act(async () => vi.advanceTimersByTime(150));
  expect(publishChat).toHaveBeenLastCalledWith("hello");
  publishChat.mockClear();
  await act(async () =>
    node.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(publishChat.mock.calls.filter(([s]) => s === "hello")).toHaveLength(1);
  expect(node.closest("form")!.hidden).toBe(true);
  expect(document.activeElement).not.toBe(node);
  await act(async () => host.querySelector("button")!.click());
  expect(field()).toBe(node);
  expect(node.value).toBe("");
  expect(document.activeElement).toBe(node);
});
it("cancels without blur re-sending the draft, and allows a new one-tap chat", async () => {
  await act(async () => host.querySelector("button")!.click());
  await act(async () => type("discard"));
  publishChat.mockClear();
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Close chat"]')!
      .click(),
  );
  expect(publishChat.mock.calls.some(([s]) => s === "discard")).toBe(false);
  expect(publishChat).toHaveBeenLastCalledWith("");
  expect(field().closest("form")!.hidden).toBe(true);
  await act(async () => host.querySelector("button")!.click());
  expect(focusedBeforeTapReturned).toBe(true);
});
