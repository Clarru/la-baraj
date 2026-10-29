import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { currentMultiplayerRoom, type MultiplayerRoom } from "./multiplayer";

/** A single lightweight overlay, visible only while the server-confirmed stun lasts. */
export function StunStars({
  room,
  playerId,
}: {
  room: MultiplayerRoom | null;
  playerId?: string;
}) {
  const node = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const activeRoom = room ?? currentMultiplayerRoom();
    if (node.current)
      node.current.style.display = activeRoom?.stunned(
        playerId ?? activeRoom.getSnapshot().selfId,
      )
        ? ""
        : "none";
  });
  return (
    <Html
      center
      position={[0, 2.45, 0]}
      zIndexRange={[6, 1]}
      style={{ pointerEvents: "none" }}
    >
      <span
        ref={node}
        className="stun-stars"
        style={{ display: "none" }}
        aria-label="Stunned"
      >
        ✦ ★ ✦
      </span>
    </Html>
  );
}
