import { useEffect, useSyncExternalStore, type RefObject } from "react";
export function mobileViewport() {
  const view = window.visualViewport;
  const unzoomed = !view || Math.abs(view.scale - 1) < 0.01;
  return {
    width: unzoomed && view ? view.width : window.innerWidth,
    height: unzoomed && view ? view.height : window.innerHeight,
    top: unzoomed && view ? view.offsetTop : 0,
    left: unzoomed && view ? view.offsetLeft : 0,
  };
}
const portrait = () =>
  typeof matchMedia !== "undefined"
    ? matchMedia("(orientation: portrait)").matches
    : false;
const subscribe = (notify: () => void) => {
  const query = matchMedia("(orientation: portrait)");
  query.addEventListener("change", notify);
  window.addEventListener("resize", notify);
  return () => {
    query.removeEventListener("change", notify);
    window.removeEventListener("resize", notify);
  };
};
export function useMobilePortrait() {
  return useSyncExternalStore(subscribe, portrait, () => false);
}
export function useMobileViewport(
  ref: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const node = ref.current;
      if (!node || document.hidden) return;
      const v = mobileViewport();
      if (v.width <= 0 || v.height <= 0) return;
      for (const key of ["width", "height", "top", "left"] as const)
        node.style.setProperty(`--mobile-${key}`, `${v[key]}px`);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("pageshow", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("pageshow", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [ref, enabled]);
}
