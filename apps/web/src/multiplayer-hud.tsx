import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, PencilSimple, UsersThree, WifiSlash } from "@phosphor-icons/react";
import type { MultiplayerRoom } from "./multiplayer";
import "./multiplayer.css";

export function MultiplayerHud({ room }: { room: MultiplayerRoom }) {
  const view = useSyncExternalStore(room.subscribe, room.getSnapshot);
  const [editing, setEditing] = useState(false), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const label = view.status === "online" ? `Online ${view.count}/30` : view.status === "full" ? "Room full · 30/30" : view.status === "connecting" ? "Joining friends…" : view.status === "reconnecting" ? "Reconnecting…" : view.status === "offline" ? "Offline · local play" : "Connection error";
  async function copyInvite() {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setCopied(false); setCopyError(false); }, 3500);
  }
  return <div className="multiplayer-hud" data-testid="multiplayer-hud" data-status={view.status}>
    <div className="multiplayer-row">
      <span className={`multiplayer-status ${view.status}`} role="status" title={view.error || "Friends in this room"}>
        {view.status === "online" ? <UsersThree size={17} /> : <WifiSlash size={17} />}<strong>{label}</strong>
      </span>
      <button className="multiplayer-invite" onClick={copyInvite} title="Copy this room’s invite link" aria-label="Copy invite link">
        {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy invite"}
      </button>
    </div>
    <div className="multiplayer-identity">
      {editing ? <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); room.rename(String(data.get("nickname") ?? "")); setEditing(false); }}>
        <input name="nickname" aria-label="Your nickname" defaultValue={view.nickname} maxLength={24} autoFocus onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") setEditing(false); }} />
        <button type="submit">Save</button>
      </form> : <button onClick={() => setEditing(true)} aria-label={`Edit nickname, currently ${view.nickname}`}><span>{view.nickname}</span><PencilSimple size={13} /></button>}
      {copyError && <span role="alert">Copy the address bar link to invite friends.</span>}
      {view.status === "full" && <span role="alert">Try again when a friend leaves. <button onClick={() => location.reload()}>Retry</button></span>}
      {view.status === "online" && view.error && <span role="alert">{view.error}</span>}
      {view.status === "error" && <span role="alert">{view.error} <button onClick={() => location.reload()}>Retry</button></span>}
    </div>
    <output hidden ref={room.attachDiagnostics} data-testid="multiplayer-metrics" />
  </div>;
}
