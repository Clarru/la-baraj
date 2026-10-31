/** Touch owns a separate input channel: no fabricated DOM keyboard events. */
export type MobileAction =
  | "interact"
  | "sit"
  | "vehicle"
  | "jump"
  | "cancel"
  | "crouch"
  | "prone"
  | "punch"
  | "seat-left"
  | "seat-right";
export type ActionKey = Pick<
  KeyboardEvent,
  | "code"
  | "repeat"
  | "target"
  | "ctrlKey"
  | "metaKey"
  | "altKey"
  | "preventDefault"
  | "stopImmediatePropagation"
> & { source?: "touch" };
const codes: Record<MobileAction, string> = {
  interact: "KeyE",
  sit: "KeyF",
  vehicle: "KeyV",
  jump: "Space",
  cancel: "Escape",
  crouch: "KeyC",
  prone: "KeyZ",
  punch: "KeyP",
  "seat-left": "KeyA",
  "seat-right": "KeyD",
};
const listeners = new Set<(event: ActionKey) => void>();
let x = 0,
  y = 0,
  running = false,
  jumpUntil = 0;
export function joystickVector(dx: number, dy: number, radius = 48) {
  const distance = Math.hypot(dx, dy);
  if (distance < radius * 0.18) return { x: 0, y: 0 };
  const scale = Math.min(1, radius / distance) / radius;
  return { x: dx * scale, y: dy * scale };
}
export function setMobileMovement(nextX: number, nextY: number) {
  x = nextX;
  y = nextY;
}
export function setMobileRun(value: boolean) {
  running = value;
}
export function resetMobileInput() {
  x = y = 0;
  running = false;
  jumpUntil = 0;
}
export function mobileKeyDown(code: string) {
  if (code === "Space") return performance.now() < jumpUntil;
  return code === "KeyW"
    ? y < -0.2
    : code === "KeyS"
      ? y > 0.2
      : code === "KeyA"
        ? x < -0.2
        : code === "KeyD"
          ? x > 0.2
          : code === "ShiftLeft" && running;
}
export function subscribeMobileActions(handler: (event: ActionKey) => void) {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}
export function performMobileAction(action: MobileAction) {
  // The physics controller samples held state on its next step.
  if (action === "jump") jumpUntil = performance.now() + 120;
  let stopped = false;
  const event: ActionKey = {
    source: "touch",
    code: codes[action],
    repeat: false,
    target: null,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault() {},
    stopImmediatePropagation() {
      stopped = true;
    },
  };
  for (const listener of listeners) {
    listener(event);
    if (stopped) break;
  }
}
