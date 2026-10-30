/** Keep game exit shortcuts from bypassing the brief, visible round result. */
export function blockPlanesResultExit(
  event: KeyboardEvent,
  planesVisible: boolean,
): boolean {
  if (
    !planesVisible ||
    !["Escape", "KeyF"].includes(event.code) ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  )
    return false;
  const board = document.querySelector(
    ".planes-notebook:not([hidden])[data-result-countdown]",
  );
  const count = board?.getAttribute("data-result-countdown");
  if (!["1", "2", "3", "4", "5"].includes(count ?? "")) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  return true;
}
