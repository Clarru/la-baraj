export type GamePanel = "menu" | "controls" | null;
export type GameShortcut =
  | "pass"
  | "block"
  | "close-panel"
  | "controls"
  | "home"
  | "reset"
  | "walk";
export type GameKey = {
  code: string;
  key: string;
  repeat: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};
/** Route UI keys in window capture before door/activity/controller listeners can receive them. */
export type GameInputState = {
  panel: GamePanel;
  homeView: boolean;
  indoors: boolean;
  typing: boolean;
};
export function gameShortcut(
  event: GameKey,
  state: GameInputState,
): GameShortcut {
  if (state.panel) {
    if (event.code === "Escape") return "close-panel";
    if (!state.typing && event.key === "?" && !event.repeat) return "controls";
    return "block";
  }
  if (state.typing || event.ctrlKey || event.metaKey || event.altKey)
    return "pass";
  if (event.repeat) return "pass";
  if (event.key === "?") return "controls";
  if (event.code === "KeyH" && !state.indoors) return "home";
  if (event.code === "KeyR") return "reset";
  if (
    state.homeView &&
    [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
      "KeyV",
    ].includes(event.code)
  )
    return "walk";
  return "pass";
}

/** Keep text entry and native dialog focus behavior while stopping game listeners. */
export function captureGameKey(
  event: GameKey &
    Pick<KeyboardEvent, "stopImmediatePropagation" | "preventDefault">,
  state: GameInputState,
): GameShortcut {
  const action = gameShortcut(event, state);
  if (action === "pass" || action === "walk") return action;
  event.stopImmediatePropagation();
  if (action !== "block") event.preventDefault();
  return action;
}
