import { useSyncExternalStore } from "react";
import { GameIcon } from "./GameArt";
import type { MultiplayerRoom, NetworkStatus } from "./multiplayer";

export function onlineLabel(status: NetworkStatus, count: number) {
  if (status === "online") return `${count} online`;
  if (status === "connecting") return "Joining…";
  if (status === "reconnecting") return "Reconnecting…";
  if (status === "offline") return "Offline";
  return status === "full" ? "World is busy" : "Connection lost";
}
export function MultiplayerHud({ room }: { room: MultiplayerRoom }) {
  const view = useSyncExternalStore(
    room.subscribe,
    room.getSnapshot,
    room.getSnapshot,
  );
  const homeError =
    view.errorCode === "homes-full" || view.errorCode === "invalid-resume";
  const retry =
    !homeError && ["error", "full", "offline"].includes(view.status);
  const label = homeError
    ? "Cabin unavailable"
    : view.errorCode === "name-save-failed"
      ? "Name not saved"
      : view.status === "error" && view.errorCode === "storage-unavailable"
        ? "Save failed"
        : onlineLabel(view.status, view.count);
  const message =
    view.error ||
    (view.status === "full"
      ? "The lake is busy. Try joining again shortly."
      : view.status === "error" || view.status === "offline"
        ? "Couldn’t connect to the lake. Try again."
        : "");
  return (
    <div
      className="multiplayer-hud"
      data-testid="multiplayer-hud"
      data-status={view.status}
    >
      <span className={`multiplayer-status ${view.status}`} role="status">
        {view.status === "online" ? (
          <GameIcon name="people" size={26} />
        ) : (
          <GameIcon name="offline" size={26} />
        )}
        <strong
          title={
            room.localPreview ? "Shared with tabs in this browser" : undefined
          }
        >
          {room.localPreview ? "Local world" : label}
        </strong>
      </span>
      {(message || retry) && (
        <div className="multiplayer-notice" role="status">
          <p>{message}</p>
          {view.errorCode === "homes-full" && (
            <p>Please ask the host for help.</p>
          )}
          {retry && <button onClick={() => location.reload()}>Retry</button>}
        </div>
      )}
      {(import.meta.env.DEV ||
        import.meta.env.VITE_GAME_DIAGNOSTICS === "1") && (
        <output
          hidden
          ref={room.attachDiagnostics}
          data-testid="multiplayer-metrics"
        />
      )}
    </div>
  );
}
