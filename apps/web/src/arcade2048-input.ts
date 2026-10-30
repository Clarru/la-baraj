import {
  arcadeOver,
  arcadeWon,
  type ArcadeDirection,
} from "../../../packages/shared/arcade2048";
import type { ArcadeScreenState, ScreenAction } from "./arcade2048-screen";

/** The actual window-capture route used by Game while the cabinet is focused. */
export function captureArcadeKey(
  event: KeyboardEvent,
  state: ArcadeScreenState,
  controls: {
    move: (direction: ArcadeDirection) => void;
    action: (action: ScreenAction) => void;
    leave: () => void;
  },
) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.code === "Tab")
    return;
  event.stopImmediatePropagation();
  const activate = event.code === "Enter" || event.code === "Space";
  // Keep native buttons usable by assistive technology and the surrounding HUD.
  if (activate && event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  if (activate) {
    if (event.repeat || state.pending) return;
    if (state.page === "confirm") controls.action("confirm");
    else if (state.page === "leaders") controls.action("back");
    else if (
      state.view?.game &&
      ((arcadeWon(state.view.game) && !state.view.game.continued) ||
        arcadeOver(state.view.game))
    )
      controls.action("continue");
    return;
  }
  if (event.code === "Escape" && !event.repeat) {
    if (state.page !== "board") controls.action("back");
    else controls.leave();
    return;
  }
  const directions: Record<string, ArcadeDirection> = {
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
  };
  if (directions[event.code]) controls.move(directions[event.code]);
  else if (event.code === "KeyN" && !event.repeat) controls.action("new");
  else if (event.code === "KeyL" && !event.repeat) controls.action("scores");
}
