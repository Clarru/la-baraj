import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BUBBLE_CHAT_IDLE_MS } from "../../../packages/shared/bubble-chat";
import { normalizeChatDraft } from "./bubble-chat-input";
import type { MultiplayerRoom } from "./multiplayer";

/** One draft/publish lifecycle for the desktop bubble and the mobile composer. */
export function useBubbleChat(
  room: MultiplayerRoom,
  active: boolean,
  editing: boolean,
  onFinish: () => void,
  onClose: () => void,
  keepEditingOpen = false,
) {
  const [text, setText] = useState("");
  const latest = useRef("");
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(active),
    writing = useRef(editing),
    wasActive = useRef(false);
  live.current = active;
  writing.current = editing;
  const cancelPending = useCallback(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
  }, []);
  const arm = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    if (live.current && !(writing.current && keepEditingOpen))
      idle.current = setTimeout(onClose, BUBBLE_CHAT_IDLE_MS);
  }, [keepEditingOpen, onClose]);
  useLayoutEffect(() => {
    if (active && editing) {
      cancelPending();
      latest.current = "";
      setText("");
      room.publishChat("");
    }
  }, [active, editing, room, cancelPending]);
  useEffect(() => {
    if (active) {
      wasActive.current = true;
      arm();
    } else {
      cancelPending();
      if (idle.current) clearTimeout(idle.current);
      if (wasActive.current) room.publishChat("");
      wasActive.current = false;
    }
  }, [active, editing, arm, cancelPending, room]);
  useEffect(
    () => () => {
      cancelPending();
      if (idle.current) clearTimeout(idle.current);
      if (wasActive.current) room.publishChat("");
    },
    [room, cancelPending],
  );
  const edit = useCallback(
    (value: string) => {
      if (!live.current || !writing.current) return;
      const next = normalizeChatDraft(value);
      latest.current = next;
      setText(next);
      arm();
      cancelPending();
      pending.current = setTimeout(() => {
        pending.current = null;
        if (live.current)
          room.publishChat(latest.current.trim() ? latest.current : "");
      }, 150);
    },
    [room, arm, cancelPending],
  );
  const finish = useCallback(() => {
    if (!live.current || !writing.current) return;
    writing.current = false;
    cancelPending();
    if (!latest.current.trim()) onClose();
    else {
      room.publishChat(latest.current);
      onFinish();
    }
  }, [room, onClose, onFinish, cancelPending]);
  const cancel = useCallback(() => {
    live.current = false;
    writing.current = false;
    cancelPending();
    if (idle.current) clearTimeout(idle.current);
    wasActive.current = false;
    room.publishChat("");
    onClose();
  }, [room, onClose, cancelPending]);
  return { text, edit, finish, cancel };
}
export type BubbleChatDraft = ReturnType<typeof useBubbleChat>;
