import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { BUBBLE_CHAT_IDLE_MS } from "../../../packages/shared/bubble-chat";
import { normalizeChatDraft } from "./bubble-chat-input";
import type { MultiplayerRoom } from "./multiplayer";
import { playerBubbleAnchor } from "./player";

/** Editing and lingering speech share an anchor, but only editing captures input. */
export function LocalBubbleChat({
  room,
  editing,
  onFinishEditing,
  onClose,
}: {
  room: MultiplayerRoom;
  editing: boolean;
  onFinishEditing: () => void;
  onClose: () => void;
}) {
  const anchor = useRef<THREE.Group>(null);
  const editor = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const display = useRef<HTMLSpanElement | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef("");
  const [text, setText] = useState("");
  const focused = useRef(false);
  const arm = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(onClose, BUBBLE_CHAT_IDLE_MS);
  }, [onClose]);
  const edit = useCallback(
    (value: string) => {
      const next = normalizeChatDraft(value);
      latest.current = next;
      setText(next);
      arm();
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        pending.current = null;
        room.publishChat(latest.current.trim() ? latest.current : "");
      }, 150);
    },
    [arm, room],
  );
  const focusInput = useCallback((node: HTMLTextAreaElement | null) => {
    input.current = node;
  }, []);
  useEffect(() => {
    arm();
    return () => {
      if (idle.current) clearTimeout(idle.current);
      if (pending.current) clearTimeout(pending.current);
      room.publishChat("");
    };
  }, [arm, room]);
  useLayoutEffect(() => {
    focused.current = false;
    if (editing) {
      // Enter starts a new thought after the previous bubble was left behind.
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
      latest.current = "";
      setText("");
      room.publishChat("");
      arm();
    }
  }, [editing, arm, room]);
  useEffect(() => {
    if (!editing) return;
    const clickAway = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        editor.current?.contains(event.target)
      )
        return;
      if (!latest.current.trim()) {
        onClose();
        return;
      }
      // Flush the last edit and renew the remote expiry at the time of the click.
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
      room.publishChat(latest.current);
      arm();
      onFinishEditing();
    };
    window.addEventListener("pointerdown", clickAway, true);
    return () => window.removeEventListener("pointerdown", clickAway, true);
  }, [editing, arm, room, onClose, onFinishEditing]);
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
                ref={focusInput}
                aria-label="Chat"
                aria-describedby="bubble-chat-help"
                placeholder="Say something…"
                value={text}
                rows={1}
                spellCheck={false}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!event.repeat) edit(`${latest.current}\n`);
                  }
                }}
                onChange={(event) => edit(event.currentTarget.value)}
              />
            </div>
            <span className="bubble-chat-help" id="bubble-chat-help">
              Others see your text as you type. Enter adds a line after text.
              Click outside to walk; press Enter again to start a new message.
              The bubble disappears after five seconds. Escape closes it
              immediately.
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
