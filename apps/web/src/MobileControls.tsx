import { bindMobileJoystick, preloadMobileJoysticks } from "./mobile-joystick";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Footprints, MessageCircle, X } from "lucide-react";
import { useTouchDevice } from "./mobile-device";
import {
  performMobileAction,
  resetMobileInput,
  setMobileMovement,
  setMobileLook,
  setMobileRun,
} from "./mobile-input";
import type { ActivityPrompt } from "./activities";

function TouchStick({
  kind,
  label,
  resetKey,
  onVector,
}: {
  kind: "move" | "look";
  label: string;
  resetKey: string;
  onVector: (x: number, y: number) => void;
}) {
  const zone = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false,
      cleanup: (() => void) | undefined;
    const element = zone.current;
    setFailed(false);
    setReady(false);
    void preloadMobileJoysticks()
      .then(({ create }) => {
        if (disposed || !element?.isConnected) return;
        cleanup = bindMobileJoystick(element, create, onVector);
        setReady(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [onVector, resetKey]);
  return (
    <div
      ref={zone}
      className={`mobile-stick-zone mobile-${kind}${ready || failed ? " is-ready" : ""}`}
      style={{ position: kind === "look" ? "absolute" : "relative" }}
      role="group"
      aria-label={`${label} joystick`}
    >
      <span className="mobile-stick-label">{label}</span>
      {failed && (
        <button onClick={() => location.reload()}>Reload controls</button>
      )}
    </div>
  );
}

export function MobileControls({
  enabled,
  moving,
  prompt,
  mounted,
  busy,
  seatedGame,
  onGame,
  onStand,
  onChat,
}: {
  enabled: boolean;
  moving: boolean;
  prompt: ActivityPrompt;
  mounted: boolean;
  busy: boolean;
  seatedGame: "Cruce" | "Planes" | null;
  onGame: () => void;
  onStand: () => void;
  onChat: () => void;
}) {
  const touch = useTouchDevice();
  const [run, setRun] = useState(false);
  useEffect(() => {
    resetMobileInput();
    setRun(false);
    return resetMobileInput;
  }, [enabled, moving, mounted, busy]);
  useEffect(() => {
    const clear = () => {
      resetMobileInput();
      setRun(false);
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("blur", clear);
    window.addEventListener("orientationchange", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", clear);
      window.removeEventListener("orientationchange", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  if (!touch || !enabled) return null;
  return (
    <div className="mobile-controls" aria-label="Touch game controls">
      {moving && !busy && !seatedGame && (
        <div className="mobile-movement">
          <TouchStick
            kind="move"
            label={mounted ? "Steer" : "Move"}
            resetKey={String(mounted)}
            onVector={setMobileMovement}
          />
          <button
            className="mobile-run"
            aria-pressed={run}
            onClick={() => {
              setRun(!run);
              setMobileRun(!run);
            }}
          >
            <Footprints size={18} /> {mounted ? "Boost" : "Run"}
          </button>
        </div>
      )}
      {moving && !busy && !seatedGame && (
        <TouchStick
          kind="look"
          label="Look"
          resetKey={String(mounted)}
          onVector={setMobileLook}
        />
      )}
      <div className="mobile-actions">
        {seatedGame ? (
          <>
            <button onClick={onGame}>Open {seatedGame}</button>
            <button onClick={onStand}>Stand up</button>
          </>
        ) : (
          <>
            {prompt?.key && (
              <button
                className="mobile-context"
                onClick={() =>
                  performMobileAction(
                    prompt.key === "F"
                      ? "sit"
                      : prompt.key === "V"
                        ? "vehicle"
                        : "interact",
                  )
                }
              >
                {prompt.key === "F" && busy
                  ? "Stand up"
                  : prompt.key === "E" && prompt.secondary
                    ? prompt.secondary.main
                    : prompt.main}
              </button>
            )}
            {prompt?.secondary && prompt.key !== prompt.secondary.key && (
              <button
                className="mobile-secondary"
                onClick={() => performMobileAction("interact")}
              >
                {prompt.secondary.main}
              </button>
            )}
            {busy && prompt?.shiftSeat && (
              <>
                <button onClick={() => performMobileAction("seat-left")}>
                  Shift left
                </button>
                <button onClick={() => performMobileAction("seat-right")}>
                  Shift right
                </button>
              </>
            )}
            {mounted && (
              <button onClick={() => performMobileAction("vehicle")}>
                Step off
              </button>
            )}
            {busy && (
              <button
                aria-label="Cancel activity or stand up"
                onClick={() => performMobileAction("cancel")}
              >
                <X size={18} /> Stop
              </button>
            )}
            {!busy && !mounted && (
              <button
                aria-label="Jump"
                onClick={() => performMobileAction("jump")}
              >
                <ArrowUp size={22} /> Jump
              </button>
            )}
          </>
        )}
        {!busy && !mounted && !seatedGame && (
          <button aria-label="Chat" onClick={onChat}>
            <MessageCircle size={21} /> Chat
          </button>
        )}
      </div>
    </div>
  );
}
