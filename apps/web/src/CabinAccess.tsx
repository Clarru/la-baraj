import { useEffect, useRef, useState } from "react";
import { DoorOpen, ArrowUUpLeft } from "@phosphor-icons/react";
import { playerPosition, type ViewMode } from "./player";
import {
  cabinDoor,
  cabinLocalToWorld,
  nearestCabinDoor,
  queueCabinTransfer,
  clearCabinTransfer,
} from "./cabin-interior-state";
import { cabinDesignForPlot } from "./cabin-designs";
export function CabinAccess({
  interiorIndex,
  homeIndex,
  focusedIndex,
  mode,
  paused,
  busy,
  vehicleMounted,
  resetKey,
  onChange,
  onTransition,
  onWalk,
  onPromptVisible,
}: {
  interiorIndex: number | null;
  homeIndex: number;
  focusedIndex: number;
  mode: ViewMode;
  paused: boolean;
  busy: boolean;
  vehicleMounted: boolean;
  resetKey: number;
  onChange: (index: number | null) => void;
  onTransition: (active: boolean) => void;
  onWalk: () => void;
  onPromptVisible?: (visible: boolean) => void;
}) {
  const [nearby, setNearby] = useState<number | null>(null),
    [nearExit, setNearExit] = useState(false);
  const [phase, setPhase] = useState<"idle" | "closing" | "opening">("idle");
  const locked = useRef(false);
  const timers = useRef<number[]>([]);
  const previousReset = useRef(resetKey);
  const cancelTransition = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    locked.current = false;
    setPhase("idle");
    onTransition(false);
  };
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  const crossDoor = (index: number, entering: boolean) => {
    if (locked.current || paused || busy || vehicleMounted) return;
    locked.current = true;
    onTransition(true);
    setPhase("closing");
    // Exchange the exterior shell and room only while the view is fully covered.
    // Both arrivals straddle the exact same world-space door plane.
    timers.current.push(
      window.setTimeout(() => {
        queueCabinTransfer(index, entering);
        onChange(entering ? index : null);
        onWalk();
      }, 260),
    );
    timers.current.push(window.setTimeout(() => setPhase("opening"), 560));
    timers.current.push(window.setTimeout(cancelTransition, 1080));
  };
  const enter = (index: number) => crossDoor(index, true);
  const leave = () => {
    if (interiorIndex !== null && nearExit) crossDoor(interiorIndex, false);
  };
  useEffect(() => {
    if (previousReset.current !== resetKey) {
      previousReset.current = resetKey;
      cancelTransition();
      clearCabinTransfer();
      onChange(null);
    }
  }, [resetKey, onChange]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (interiorIndex === null) {
        setNearby(nearestCabinDoor(playerPosition));
        setNearExit(false);
      } else {
        const door = cabinDoor(interiorIndex),
          p = cabinLocalToWorld(interiorIndex, door.x, door.insideZ - 0.65);
        setNearExit(
          Math.hypot(playerPosition.x - p.x, playerPosition.z - p.z) < 1.25,
        );
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [interiorIndex]);
  const target =
    mode === "home"
      ? homeIndex
      : mode === "settlement"
        ? focusedIndex
        : mode === "walk"
          ? nearby
          : null;
  useEffect(() => {
    onPromptVisible?.(
      interiorIndex === null &&
        target !== null &&
        !paused &&
        !busy &&
        !vehicleMounted,
    );
  }, [interiorIndex, target, paused, busy, vehicleMounted, onPromptVisible]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const node = event.target;
      if (
        locked.current ||
        event.repeat ||
        paused ||
        (node instanceof HTMLElement &&
          (node.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName)))
      )
        return;
      if (
        interiorIndex !== null &&
        nearExit &&
        (event.code === "Escape" || event.code === "KeyE")
      ) {
        event.preventDefault();
        leave();
        return;
      }
      if (
        interiorIndex === null &&
        event.code === "KeyE" &&
        target !== null &&
        !busy &&
        !vehicleMounted
      ) {
        event.preventDefault();
        enter(target);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [interiorIndex, target, nearExit, paused, busy, vehicleMounted]);
  const curtain = (
    <div
      className={`cabin-transition cabin-transition--${phase}`}
      aria-hidden="true"
      data-testid="door-transition"
      data-phase={phase}
    />
  );
  if (paused) return curtain;
  if (interiorIndex !== null)
    return (
      <>
        {curtain}
        <div className="cabin-entry-panel" data-testid="interior-controls">
          <DoorOpen size={21} />
          <div>
            <strong>
              Inside cabin {String(interiorIndex + 1).padStart(2, "0")}
            </strong>
            <span>
              {nearExit
                ? "E at the door to go outside"
                : "WASD to explore · walk to the door to leave"}
            </span>
          </div>
          <button onClick={leave} disabled={!nearExit || phase !== "idle"}>
            <ArrowUUpLeft size={16} />
            Go outside <kbd>Esc</kbd>
          </button>
        </div>
      </>
    );
  if (target === null || busy || vehicleMounted) return curtain;
  return (
    <>
      {curtain}
      <div className="cabin-entry-panel" data-testid="cabin-entry">
        <DoorOpen size={22} />
        <div>
          <strong>
            {target === homeIndex
              ? "Your cabin"
              : `Cabin ${String(target + 1).padStart(2, "0")}`}
          </strong>
          <span>
            {cabinDesignForPlot(target).label} ·{" "}
            {target === homeIndex
              ? "make yourself at home"
              : "unclaimed local preview"}
          </span>
        </div>
        <button
          disabled={busy || vehicleMounted || phase !== "idle"}
          onClick={() => enter(target)}
        >
          {vehicleMounted
            ? "Park the scooter first"
            : busy
              ? "Finish your activity first"
              : "Go inside"}
          <kbd>E</kbd>
        </button>
      </div>
    </>
  );
}
