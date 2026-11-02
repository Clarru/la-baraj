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
    let disposed = false;
    let typing = false,
      freezeChat = false,
      restoring = false;
    let stable = mobileViewport();
    let anchor: { x: number; y: number } | null = null;
    let scroll = { x: window.scrollX, y: window.scrollY };
    const editable = () =>
      document.activeElement instanceof HTMLElement &&
      document.activeElement.matches(
        "textarea,input:not([type=checkbox]):not([type=radio]),[contenteditable=true]",
      );
    const apply = () => {
      frame = 0;
      const node = ref.current;
      if (!node || document.hidden) return;
      const visible = mobileViewport();
      const unzoomed =
        !window.visualViewport ||
        Math.abs(window.visualViewport.scale - 1) < 0.01;
      if ((typing || restoring) && unzoomed && visible.width !== stable.width) {
        // A keyboard does not change the viewport width. Rotation can finish
        // laying out after orientationchange, so rebase from the new layout.
        stable = {
          width: visible.width,
          height:
            document.documentElement.clientWidth === visible.width
              ? document.documentElement.clientHeight
              : window.innerHeight,
          top: 0,
          left: 0,
        };
        restoring = false;
        anchor = null;
      }
      if (
        restoring &&
        unzoomed &&
        (window.scrollX !== scroll.x || window.scrollY !== scroll.y)
      )
        window.scrollTo({ left: scroll.x, top: scroll.y, behavior: "instant" });
      if (
        restoring &&
        visible.width === stable.width &&
        visible.height >= stable.height - 1 &&
        Math.abs(visible.top - stable.top) < 1 &&
        Math.abs(visible.left - stable.left) < 1
      )
        restoring = false;
      const v = freezeChat
        ? {
            ...stable,
            top: unzoomed ? visible.top : stable.top,
            left: unzoomed ? visible.left : stable.left,
          }
        : restoring
          ? stable
          : visible;
      if (v.width <= 0 || v.height <= 0) return;
      if (!typing && !restoring) stable = { ...v };
      for (const key of ["width", "height", "top", "left"] as const)
        node.style.setProperty(`--mobile-${key}`, `${v[key]}px`);
      if (
        typing &&
        !freezeChat &&
        unzoomed &&
        document.activeElement instanceof HTMLElement
      ) {
        const field = document.activeElement;
        const bounds = field.getBoundingClientRect();
        // Safari can pan the document while a fixed frame already compensates
        // that pan. Compare DOM rectangles in the same coordinate space.
        const exposed = node.getBoundingClientRect();
        if (
          bounds.top < exposed.top ||
          bounds.bottom > exposed.top + v.height ||
          bounds.left < exposed.left ||
          bounds.right > exposed.left + v.width
        )
          field.scrollIntoView({
            block: "nearest",
            inline: "nearest",
            behavior: "instant",
          });
      }
      if ((freezeChat || restoring) && anchor && unzoomed) {
        // iOS versions differ in whether fixed layers follow the keyboard pan.
        // Keep the measured pre-focus world origin, rather than trusting a stale offset.
        const rect = node.getBoundingClientRect();
        if (Math.abs(rect.y - anchor.y) > 0.5)
          node.style.setProperty(
            "--mobile-top",
            `${v.top + anchor.y - rect.y}px`,
          );
        if (Math.abs(rect.x - anchor.x) > 0.5)
          node.style.setProperty(
            "--mobile-left",
            `${v.left + anchor.x - rect.x}px`,
          );
      }
    };
    const update = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    const focusIn = () => {
      if (!editable()) return;
      if (!typing) {
        scroll = { x: window.scrollX, y: window.scrollY };
        const rect = ref.current?.getBoundingClientRect();
        anchor = rect ? { x: rect.x, y: rect.y } : null;
      }
      typing = true;
      // Only the overlay composer freezes the world. Ordinary form fields need
      // the visible height so their scroll container can reveal them above iOS.
      freezeChat =
        document.activeElement?.matches("[data-mobile-chat-input]") ?? false;
      restoring = false;
      update();
    };
    const focusOut = () =>
      queueMicrotask(() => {
        if (disposed || editable()) return;
        typing = false;
        freezeChat = false;
        restoring = true;
        update();
      });
    const rotate = () => {
      typing = editable();
      freezeChat =
        typing &&
        (document.activeElement?.matches("[data-mobile-chat-input]") ?? false);
      restoring = false;
      anchor = null;
      stable = {
        width: document.documentElement.clientWidth || window.innerWidth,
        height: document.documentElement.clientHeight || window.innerHeight,
        top: 0,
        left: 0,
      };
      update();
    };
    apply();
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", rotate);
    window.addEventListener("pageshow", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", rotate);
      window.removeEventListener("pageshow", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [ref, enabled]);
}
