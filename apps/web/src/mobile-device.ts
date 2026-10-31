import { useSyncExternalStore } from "react";
import { isMobileDevice } from "./device-access";
export function touchDevice() {
  return (
    typeof navigator !== "undefined" &&
    (isMobileDevice(navigator) ||
      (typeof matchMedia !== "undefined" &&
        matchMedia("(pointer: coarse)").matches))
  );
}
const subscribe = (notify: () => void) => {
  const query = matchMedia("(pointer: coarse)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
export function useTouchDevice() {
  return useSyncExternalStore(subscribe, touchDevice, touchDevice);
}
