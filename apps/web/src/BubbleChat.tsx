import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { playerBubbleAnchor } from "./player";
import { useBubbleText, type BubbleChatDraft } from "./use-bubble-chat";

export function LocalBubbleChat({
  draft,
  editing,
}: {
  draft: BubbleChatDraft;
  editing: boolean;
}) {
  const { edit, finish: finishEditing } = draft;
  const text = useBubbleText(draft);
  const anchor = useRef<THREE.Group>(null);
  const editor = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const display = useRef<HTMLSpanElement | null>(null);
  const focused = useRef(false);
  useEffect(() => {
    focused.current = false;
  }, [editing]);
  useEffect(() => {
    if (!editing) return;
    const clickAway = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        editor.current?.contains(event.target)
      )
        return;
      finishEditing();
    };
    window.addEventListener("pointerdown", clickAway, true);
    return () => window.removeEventListener("pointerdown", clickAway, true);
  }, [editing, finishEditing]);
  useEffect(() => {
    if (input.current) input.current.scrollTop = input.current.scrollHeight;
    if (display.current)
      display.current.scrollTop = display.current.scrollHeight;
  }, [text, editing]);
  useFrame(() => {
    anchor.current?.position.copy(playerBubbleAnchor);
    const node = input.current;
    // Drei hides its HTML until the first projection; wait until it is visible.
    if (
      editing &&
      !focused.current &&
      node?.isConnected &&
      node.getClientRects().length
    ) {
      node.focus({ preventScroll: true });
      focused.current = document.activeElement === node;
    }
  });
  if (!editing && !text) return null;
  return (
    <group ref={anchor} position={playerBubbleAnchor.toArray()}>
      <Html
        center
        position={[0, 1.7, 0]}
        zIndexRange={[12, 8]}
        style={{ pointerEvents: editing ? "auto" : "none" }}
      >
        {editing ? (
          <div ref={editor} className="bubble-chat bubble-chat-editor">
            <div className="bubble-chat-content">
              <span className="bubble-chat-measure" aria-hidden="true">
                {text ? `${text}\u200b` : "Say something…"}
              </span>
              <textarea
                ref={input}
                aria-label="Chat"
                aria-describedby="bubble-chat-help"
                placeholder="Say something…"
                value={text}
                rows={1}
                spellCheck={false}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.stopPropagation();
                    if (event.repeat) {
                      event.preventDefault();
                      return;
                    }
                    // Let the textarea insert Shift+Enter at the caret.
                    if (event.shiftKey) return;
                    event.preventDefault();
                    finishEditing();
                  }
                }}
                onChange={(event) => edit(event.currentTarget.value)}
              />
            </div>
            <span className="bubble-chat-help" id="bubble-chat-help">
              Others see your text as you type. Enter sends; Shift+Enter adds a
              line. Clicking outside also finishes typing. Press Enter again to
              start a new message. The bubble disappears after five seconds.
              Escape closes it immediately.
            </span>
          </div>
        ) : (
          <div className="bubble-chat bubble-chat-lingering">
            <span ref={display} className="bubble-chat-message">
              {text}
            </span>
          </div>
        )}
      </Html>
    </group>
  );
}
