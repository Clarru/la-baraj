import { MOUSE } from "three";
import type { OrbitControls } from "three-stdlib";

/** OrbitControls swaps rotate and pan when a modifier is held. During play,
 * pan is disabled, so that default makes Shift-sprint + mouse drag do nothing.
 * Pick the inverse mapping before OrbitControls sees the pointerdown event.
 */
export function bindCameraMouse(
  controls: OrbitControls,
  element: HTMLElement,
): () => void {
  const pointerDown = (event: PointerEvent) => {
    if (
      event.pointerType === "touch" ||
      (event.button !== 0 && event.button !== 2)
    )
      return;
    if (import.meta.env.DEV || import.meta.env.VITE_GAME_DIAGNOSTICS === "1") {
      element.setAttribute(
        "data-camera-pointer",
        JSON.stringify({
          button: event.button,
          shift: event.shiftKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
        }),
      );
    }
    if (controls.enablePan) {
      controls.mouseButtons.LEFT = MOUSE.ROTATE;
      controls.mouseButtons.RIGHT = MOUSE.PAN;
      return;
    }
    const modified = event.shiftKey || event.ctrlKey || event.metaKey;
    const rotate = modified ? MOUSE.PAN : MOUSE.ROTATE;
    controls.mouseButtons.LEFT = rotate;
    controls.mouseButtons.RIGHT = rotate;
  };
  element.addEventListener("pointerdown", pointerDown, true);
  return () => {
    element.removeEventListener("pointerdown", pointerDown, true);
    controls.mouseButtons.LEFT = MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = MOUSE.PAN;
  };
}
