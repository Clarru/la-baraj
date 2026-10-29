import { useCallback, useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {
  BUBBLE_CHAT_IDLE_MS,
  normalizeBubbleText,
} from "../../../packages/shared/bubble-chat";
import type { MultiplayerRoom } from "./multiplayer";
import { playerViewPosition } from "./player";

/** Local editor follows the interpolated character, without re-rendering the world on each key. */
export function LocalBubbleChat({
  room,
  onClose,
}: {
  room: MultiplayerRoom;
  onClose: () => void;
}) {
  const anchor = useRef<THREE.Group>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef("");
  const [text, setText] = useState("");
  const arm = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(onClose, BUBBLE_CHAT_IDLE_MS);
  }, [onClose]);
  const edit = useCallback(
    (value: string) => {
      const next = normalizeBubbleText(value);
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
  const focused = useRef(false);
  useEffect(() => {
    arm();
    return () => {
      if (idle.current) clearTimeout(idle.current);
      if (pending.current) clearTimeout(pending.current);
      room.publishChat("");
    };
  }, [arm, room]);
  useEffect(() => {
    if (input.current) input.current.scrollTop = input.current.scrollHeight;
  }, [text]);
  useFrame(() => {
    anchor.current?.position.copy(playerViewPosition);
    const node = input.current;
    // Drei hides its HTML until the first projection. Focus only after the
    // element is actually visible; otherwise the browser ignores focus().
    if (!focused.current && node?.isConnected && node.getClientRects().length) {
      node.focus({ preventScroll: true });
      focused.current = document.activeElement === node;
    }
  });
  return (
    <group ref={anchor} position={playerViewPosition.toArray()}>
      <Html
        center
        position={[0, 1.7, 0]}
        zIndexRange={[12, 8]}
        style={{ pointerEvents: "auto" }}
      >
        <div className="bubble-chat bubble-chat-editor">
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
              rows={2}
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
            Others see your text as you type. Enter adds a line. Escape closes
            the chat; it also closes after five seconds without typing.
          </span>
        </div>
      </Html>
    </group>
  );
}
