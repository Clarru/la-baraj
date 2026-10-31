import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowUp, Footprints, MessageCircle, X } from "lucide-react";
import { useTouchDevice } from "./mobile-device";
import {
  joystickVector,
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
  const node = useRef<HTMLButtonElement>(null);
  const contact = useRef<{
    id: number;
    x: number;
    y: number;
    radius: number;
    travel: number;
  } | null>(null);
  const clear = () => {
    const previous = contact.current;
    contact.current = null;
    onVector(0, 0);
    node.current?.style.setProperty("--stick-x", "0px");
    node.current?.style.setProperty("--stick-y", "0px");
    if (previous && node.current?.hasPointerCapture?.(previous.id))
      node.current.releasePointerCapture(previous.id);
  };
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("blur", clear);
    window.addEventListener("orientationchange", clear);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clear();
      window.removeEventListener("blur", clear);
      window.removeEventListener("orientationchange", clear);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [onVector, resetKey]);
  const update = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const p = contact.current;
    if (!p || p.id !== event.pointerId) return;
    event.stopPropagation();
    const vector = joystickVector(
      event.clientX - p.x,
      event.clientY - p.y,
      p.radius,
    );
    onVector(vector.x, vector.y);
    event.currentTarget.style.setProperty(
      "--stick-x",
      `${vector.x * p.travel}px`,
    );
    event.currentTarget.style.setProperty(
      "--stick-y",
      `${vector.y * p.travel}px`,
    );
  };
  const stop = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (contact.current?.id === event.pointerId) clear();
  };
  return (
    <button
      ref={node}
      className={`mobile-stick mobile-${kind}`}
      aria-label={
        kind === "move"
          ? "Movement joystick: drag to walk or steer"
          : "Look joystick: drag to look left, right, up or down"
      }
      onPointerDown={(event) => {
        event.stopPropagation();
        if (contact.current) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        contact.current = {
          id: event.pointerId,
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
          radius: bounds.width * 0.36,
          travel: bounds.width * 0.28,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={update}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
    >
      <span />
      <span className="mobile-stick-label">{label}</span>
    </button>
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
