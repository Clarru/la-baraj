// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MultiplayerRoom } from "./multiplayer";
import { LocalBubbleChat } from "./BubbleChat";

vi.mock("@react-three/fiber", () => ({ useFrame: () => {} }));
vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./player", () => ({
  playerBubbleAnchor: { toArray: () => [0, 0, 0] },
}));
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let publishChat = vi.fn<(text: string) => void>();
let finish = vi.fn<() => void>();
let close = vi.fn<() => void>();
let room: MultiplayerRoom;
function render(editing = true) {
  root.render(
    <LocalBubbleChat
      room={room}
      editing={editing}
      onFinishEditing={finish}
      onClose={close}
    />,
  );
}
function field() {
  return container.querySelector("textarea")!;
}
function type(text: string) {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!.call(field(), text);
  field().dispatchEvent(new Event("input", { bubbles: true }));
}
function enter(options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    cancelable: true,
    ...options,
  });
  field().dispatchEvent(event);
  return event;
}
beforeEach(async () => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  publishChat = vi.fn();
  room = { publishChat } as unknown as MultiplayerRoom;
  finish = vi.fn(() => render(false));
  close = vi.fn(() => root.render(null));
  await act(async () => render());
  publishChat.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("chat send and newline shortcuts", () => {
  it("sends immediately with Enter and keeps the bubble for five seconds", async () => {
    await act(async () => type("hello"));
    let event!: KeyboardEvent;
    await act(async () => {
      event = enter();
    });
    expect(event.defaultPrevented).toBe(true);
    expect(finish).toHaveBeenCalledOnce();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector(".bubble-chat-message")?.textContent).toBe(
      "hello",
    );
    expect(publishChat).toHaveBeenLastCalledWith("hello");
    await act(async () => vi.advanceTimersByTime(150));
    expect(publishChat).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(4850));
    expect(close).toHaveBeenCalledOnce();
    expect(publishChat).toHaveBeenLastCalledWith("");
  });

  it("allows the native Shift+Enter insertion and sends both lines with Enter", async () => {
    await act(async () => type("firstsecond"));
    field().setSelectionRange(5, 5);
    let event!: KeyboardEvent;
    await act(async () => {
      event = enter({ shiftKey: true });
    });
    expect(event.defaultPrevented).toBe(false);
    expect(finish).not.toHaveBeenCalled();
    // jsdom does not perform the browser's default textarea insertion.
    await act(async () => type("first\nsecond"));
    await act(async () => {
      enter();
    });
    expect(publishChat).toHaveBeenLastCalledWith("first\nsecond");
    expect(container.querySelector(".bubble-chat-message")?.textContent).toBe(
      "first\nsecond",
    );
  });

  it("still finishes on click-away and starts fresh when reopened", async () => {
    await act(async () => type("left behind"));
    await act(async () =>
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })),
    );
    expect(finish).toHaveBeenCalledOnce();
    expect(publishChat).toHaveBeenLastCalledWith("left behind");
    await act(async () => render(true));
    expect(field().value).toBe("");
    expect(publishChat).toHaveBeenLastCalledWith("");
    await act(async () => vi.advanceTimersByTime(150));
    expect(publishChat).toHaveBeenLastCalledWith("");
  });

  it("closes an empty editor with Enter without sending a blank message", async () => {
    await act(async () => {
      enter();
    });
    expect(close).toHaveBeenCalledOnce();
    expect(finish).not.toHaveBeenCalled();
    expect(container.querySelector("textarea")).toBeNull();
    expect(publishChat.mock.calls.every(([text]) => text === "")).toBe(true);
  });

  it("ignores held Enter and leaves IME confirmation to the browser", async () => {
    await act(async () => type("draft"));
    let repeated!: KeyboardEvent;
    let composing!: KeyboardEvent;
    await act(async () => {
      repeated = enter({ repeat: true });
      composing = enter({ isComposing: true });
    });
    expect(repeated.defaultPrevented).toBe(true);
    expect(composing.defaultPrevented).toBe(false);
    expect(finish).not.toHaveBeenCalled();
    expect(field().value).toBe("draft");
  });
});
