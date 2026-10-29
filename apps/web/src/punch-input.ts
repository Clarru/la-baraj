/** A stationary middle click on the world canvas punches. Camera drags and wheel remain unchanged. */
export function bindPunchPointer(element: HTMLElement, punch: () => void) {
  const view = element.ownerDocument?.defaultView;
  let pressed: { id: number; x: number; y: number } | null = null;
  const cancel = () => {
    pressed = null;
  };
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
    pressed = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const move = (event: PointerEvent) => {
    if (
      pressed &&
      event.pointerId === pressed.id &&
      Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 6
    )
      cancel();
  };
  const up = (event: PointerEvent) => {
    if (!pressed || event.pointerId !== pressed.id || event.button !== 1)
      return;
    const click =
      Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) <= 6;
    cancel();
    event.preventDefault();
    event.stopImmediatePropagation();
    if (
      click &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    )
      punch();
  };
  const auxiliary = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault();
  };
  element.addEventListener("pointerdown", down, true);
  element.addEventListener("pointermove", move, true);
  element.addEventListener("pointerup", up, true);
  element.addEventListener("pointercancel", cancel);
  element.addEventListener("lostpointercapture", cancel);
  element.addEventListener("pointerleave", cancel);
  element.addEventListener("auxclick", auxiliary);
  view?.addEventListener("blur", cancel);
  return () => {
    cancel();
    element.removeEventListener("pointerdown", down, true);
    element.removeEventListener("pointermove", move, true);
    element.removeEventListener("pointerup", up, true);
    element.removeEventListener("pointercancel", cancel);
    element.removeEventListener("lostpointercapture", cancel);
    element.removeEventListener("pointerleave", cancel);
    element.removeEventListener("auxclick", auxiliary);
    view?.removeEventListener("blur", cancel);
  };
}
