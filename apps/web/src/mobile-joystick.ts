/** NippleJS owns gestures; this adapter owns only our axes and public lifecycle. */
type Library = typeof import("nipplejs");
let libraryPromise: Promise<Library> | undefined;
export function preloadMobileJoysticks() {
  return (libraryPromise ??= import("nipplejs").catch((error) => {
    libraryPromise = undefined;
    throw error;
  }));
}
export function bindMobileJoystick(
  zone: HTMLElement,
  create: Library["create"],
  onVector: (x: number, y: number) => void,
) {
  let manager: ReturnType<Library["create"]> | undefined;
  let disposed = false,
    generation = 0,
    gesture = 0,
    active = false;
  let usable = true,
    nativeReleased = false;
  let startTarget: EventTarget | null = null;
  let nativeId: number | null = null,
    pointerId: number | undefined;
  let recovery: ReturnType<typeof setTimeout> | undefined;
  const zero = () => onVector(0, 0);
  const cancelRecovery = () => {
    clearTimeout(recovery);
    recovery = undefined;
  };
  const build = () => {
    if (disposed || !usable || document.hidden || !zone.isConnected || manager)
      return;
    const version = ++generation;
    manager = create({
      zone,
      mode: "static",
      position: { left: "50%", top: "50%" },
      size: 96,
      threshold: 0.1,
      fadeTime: 80,
      restOpacity: 0.65,
      restJoystick: true,
      dynamicPage: true,
      color: { front: "#f5eedb", back: "#243f32" },
    });
    manager.on("start", () => {
      if (disposed || version !== generation) return;
      active = true;
      nativeReleased = false;
      pointerId = undefined;
      gesture++;
      cancelRecovery();
    });
    manager.on("move", (event) => {
      if (disposed || version !== generation || !active || nativeReleased)
        return;
      pointerId = event.data.instance.identifier;
      const v = event.data.vector;
      if (Math.hypot(v.x, v.y) < 0.1) zero();
      else onVector(v.x, -v.y);
    });
    manager.on("end", (event) => {
      if (
        disposed ||
        version !== generation ||
        (pointerId !== undefined && event.data.identifier !== pointerId)
      )
        return;
      active = false;
      pointerId = undefined;
      zero();
    });
  };
  const reset = () => {
    cancelRecovery();
    ++generation;
    ++gesture;
    active = false;
    nativeReleased = true;
    nativeId = null;
    pointerId = undefined;
    const previous = manager;
    manager = undefined;
    previous?.destroy();
    zero();
    if (!document.hidden) build();
  };
  const inside = (target: EventTarget | null) =>
    target instanceof Node && zone.contains(target);
  const preparePointer = (event: PointerEvent) => {
    if (!inside(event.target)) return;
    if (!usable && !document.hidden) {
      usable = true;
      build();
    }
    // A new contact can arrive before the deferred orphan check. Re-arm only this idle zone.
    if (recovery && active && nativeId === null) reset();
    else cancelRecovery();
    startTarget = event.target;
  };
  const nativeStart = (event: TouchEvent) => {
    const own = Array.from(event.changedTouches).find(
      (touch) => inside(touch.target) || touch.target === startTarget,
    );
    if (!own) return;
    if (!usable && !document.hidden) {
      usable = true;
      build();
    }
    startTarget = null;
    if (
      nativeId !== null &&
      Array.from(event.touches).some((touch) => touch.identifier === nativeId)
    )
      return;
    if (recovery && active) reset();
    else cancelRecovery();
    nativeReleased = false;
    nativeId = own.identifier;
    ++gesture;
  };
  const nativeEnd = (event: TouchEvent) => {
    if (
      nativeId === null ||
      !Array.from(event.changedTouches).some(
        (touch) => touch.identifier === nativeId,
      ) ||
      Array.from(event.touches).some((touch) => touch.identifier === nativeId)
    )
      return;
    nativeId = null;
    nativeReleased = true;
    zero();
    const version = generation,
      contact = gesture;
    cancelRecovery();
    recovery = setTimeout(() => {
      recovery = undefined;
      // Normal library end does not rebuild. Missing-end recovery uses only public destroy/create.
      if (
        !disposed &&
        version === generation &&
        contact === gesture &&
        nativeId === null &&
        active
      )
        reset();
    }, 32);
  };
  const prevent = (event: Event) => event.preventDefault();
  const suspend = () => {
    usable = false;
    reset();
  };
  const resume = () => {
    usable = !document.hidden;
    build();
  };
  const hidden = () => {
    if (document.hidden) suspend();
    else resume();
  };
  document.addEventListener("pointerdown", preparePointer, true);
  document.addEventListener("touchstart", nativeStart, true);
  document.addEventListener("touchend", nativeEnd, true);
  document.addEventListener("touchcancel", nativeEnd, true);
  zone.addEventListener("touchstart", prevent, { passive: false });
  zone.addEventListener("touchmove", prevent, { passive: false });
  zone.addEventListener("contextmenu", prevent);
  window.addEventListener("blur", suspend);
  window.addEventListener("pagehide", suspend);
  window.addEventListener("focus", resume);
  window.addEventListener("pageshow", resume);
  window.addEventListener("orientationchange", reset);
  document.addEventListener("visibilitychange", hidden);
  build();
  return () => {
    disposed = true;
    cancelRecovery();
    ++generation;
    const previous = manager;
    manager = undefined;
    previous?.destroy();
    zero();
    document.removeEventListener("pointerdown", preparePointer, true);
    document.removeEventListener("touchstart", nativeStart, true);
    document.removeEventListener("touchend", nativeEnd, true);
    document.removeEventListener("touchcancel", nativeEnd, true);
    zone.removeEventListener("touchstart", prevent);
    zone.removeEventListener("touchmove", prevent);
    zone.removeEventListener("contextmenu", prevent);
    window.removeEventListener("blur", suspend);
    window.removeEventListener("pagehide", suspend);
    window.removeEventListener("focus", resume);
    window.removeEventListener("pageshow", resume);
    window.removeEventListener("orientationchange", reset);
    document.removeEventListener("visibilitychange", hidden);
  };
}
