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
  setMobileRun,
} from "./mobile-input";
import type { ActivityPrompt } from "./activities";

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
  const pointer = useRef<number | null>(null);
  const stick = useRef<HTMLButtonElement>(null);
  const [run, setRun] = useState(false);
  useEffect(() => {
    resetMobileInput();
    setRun(false);
    pointer.current = null;
    stick.current?.style.setProperty("--stick-x", "0px");
    stick.current?.style.setProperty("--stick-y", "0px");
    return resetMobileInput;
  }, [enabled, moving, mounted, busy]);
  useEffect(() => {
    const clear = () => {
      resetMobileInput();
      setRun(false);
      pointer.current = null;
      stick.current?.style.setProperty("--stick-x", "0px");
      stick.current?.style.setProperty("--stick-y", "0px");
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
  const update = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== pointer.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const vector = joystickVector(
      event.clientX - bounds.left - bounds.width / 2,
      event.clientY - bounds.top - bounds.height / 2,
    );
    setMobileMovement(vector.x, vector.y);
    event.currentTarget.style.setProperty("--stick-x", `${vector.x * 42}px`);
    event.currentTarget.style.setProperty("--stick-y", `${vector.y * 42}px`);
  };
  const stop = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    setMobileMovement(0, 0);
    event.currentTarget.style.setProperty("--stick-x", "0px");
    event.currentTarget.style.setProperty("--stick-y", "0px");
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div className="mobile-controls" aria-label="Touch game controls">
      {moving && !busy && !seatedGame && (
        <div className="mobile-movement">
          <button
            ref={stick}
            className="mobile-stick"
            aria-label="Movement joystick: drag to walk or steer"
            onPointerDown={(event) => {
              if (pointer.current !== null) return;
              event.preventDefault();
              pointer.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              update(event);
            }}
            onPointerMove={update}
            onPointerUp={stop}
            onPointerCancel={stop}
            onLostPointerCapture={stop}
          >
            <span />
            <span className="mobile-stick-label">
              {mounted ? "Steer" : "Move"}
            </span>
          </button>
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
