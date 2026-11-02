import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import { ArrowUp, X } from "lucide-react";
import { useBubbleText, type BubbleChatDraft } from "./use-bubble-chat";

export function focusMobileChat(
  input: RefObject<HTMLTextAreaElement | null>,
  show: () => void,
) {
  flushSync(show);
  input.current?.focus({ preventScroll: true });
}

/** A persistent DOM editor: the Chat tap can focus it synchronously on iOS. */
export function MobileChatComposer({
  inputRef,
  editing,
  draft,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  editing: boolean;
  draft: BubbleChatDraft;
}) {
  const editor = useRef<HTMLFormElement>(null);
  const text = useBubbleText(draft);
  const finish = () => {
    draft.finish();
    inputRef.current?.blur();
  };
  useLayoutEffect(() => {
    if (!editing) return;
    const place = () => {
      const v = window.visualViewport;
      // Only the composer follows the keyboard's visible area. The world does not resize.
      editor.current?.style.setProperty(
        "--chat-pan",
        `${v && Math.abs(v.scale - 1) < 0.01 ? v.offsetTop : 0}px`,
      );
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !editor.current?.contains(event.target)
      )
        finish();
    };
    const hide = () => {
      if (document.hidden) {
        draft.cancel();
        inputRef.current?.blur();
      }
    };
    place();
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [editing, draft.finish, draft.cancel, inputRef]);
  return createPortal(
    <form
      ref={editor}
      className="mobile-chat-composer"
      hidden={!editing}
      aria-label="Chat message"
      onSubmit={(e) => {
        e.preventDefault();
        finish();
      }}
    >
      <textarea
        ref={inputRef}
        data-mobile-chat-input
        aria-label="Chat"
        placeholder="Say something…"
        rows={1}
        value={text}
        onChange={(e) => draft.edit(e.currentTarget.value)}
        onBlur={() => {
          if (editing) draft.finish();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            draft.cancel();
            inputRef.current?.blur();
          } else if (
            e.key === "Enter" &&
            !e.shiftKey &&
            !e.nativeEvent.isComposing
          ) {
            e.preventDefault();
            if (!e.repeat) finish();
          }
        }}
      />
      <button
        type="submit"
        onPointerDown={(e) => e.preventDefault()}
        aria-label="Send message"
      >
        <ArrowUp size={22} />
        <span>Send</span>
      </button>
      <button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          draft.cancel();
          inputRef.current?.blur();
        }}
        aria-label="Close chat"
      >
        <X size={22} />
      </button>
    </form>,
    document.body,
  );
}
