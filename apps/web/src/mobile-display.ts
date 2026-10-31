import { useSyncExternalStore } from "react";
import { resetMobileInput } from "./mobile-input";
type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
let installPrompt: InstallPrompt | null = null;
let blocked = false;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
export function installMobileDisplay() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    notify();
  });
  window.addEventListener("blur", resetMobileInput);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetMobileInput();
  });
}
export function subscribeDisplay(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}
export function useInstallAvailable() {
  return useSyncExternalStore(
    subscribeDisplay,
    () => installPrompt !== null,
    () => false,
  );
}
export async function installGame() {
  const prompt = installPrompt;
  if (!prompt) return false;
  installPrompt = null;
  notify();
  try {
    await prompt.prompt();
    return (await prompt.userChoice).outcome === "accepted";
  } catch {
    return false;
  }
}
export function immersiveDisplay() {
  return (
    !!document.fullscreenElement ||
    matchMedia("(display-mode: fullscreen)").matches ||
    matchMedia("(display-mode: standalone)").matches ||
    !!(navigator as Navigator & { standalone?: boolean }).standalone
  );
}
export function blockMobileGame(value: boolean) {
  if (blocked === value) return;
  blocked = value;
  resetMobileInput();
  notify();
}
export function useMobileBlocked() {
  return useSyncExternalStore(
    subscribeDisplay,
    () => blocked,
    () => false,
  );
}
export async function enterGameFullscreen() {
  if (immersiveDisplay()) return true;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    return true;
  } catch {
    return false;
  }
}
