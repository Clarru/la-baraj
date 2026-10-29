/** Reserve middle click on the world canvas; left/right drag and wheel stay camera controls.
 * The callback uses the same gameplay guards as the keyboard shortcut.
 */
export function bindPunchPointer(element: HTMLElement, punch: () => void) {
  const down = (event: PointerEvent) => {
    if (
      event.button !== 1 ||
      event.pointerType === "touch" ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    punch();
  };
  const auxiliary = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault();
  };
  element.addEventListener("pointerdown", down, true);
  element.addEventListener("auxclick", auxiliary);
  return () => {
    element.removeEventListener("pointerdown", down, true);
    element.removeEventListener("auxclick", auxiliary);
  };
}
