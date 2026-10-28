const nameKey = "la-baraj-player-name-v2";
export function validPlayerName(value: string): boolean {
  const name = value.trim();
  return name.length > 0 && name.length <= 24 && !/[\p{C}<>]/u.test(name);
}
export function readPlayerName(): string | null {
  try {
    const name = localStorage.getItem(nameKey);
    return name && validPlayerName(name) ? name.trim() : null;
  } catch {
    return null;
  }
}
export function savePlayerName(value: string): string {
  const name = value.trim();
  if (!validPlayerName(name))
    throw Error(
      "Use 1–24 characters, without angle brackets or control characters.",
    );
  try {
    localStorage.setItem(nameKey, name);
  } catch {
    /* Current-session onboarding still works. */
  }
  return name;
}
