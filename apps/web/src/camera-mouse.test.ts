import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { OrbitControls } from "three-stdlib";
import { bindCameraMouse } from "./camera-mouse";

/** Real OrbitControls with a tiny DOM event target; captures run before bubbling. */
class Target {
  private listeners = new Map<
    string,
    { fn: (event: any) => void; capture: boolean }[]
  >();
  addEventListener(type: string, fn: (event: any) => void, capture = false) {
    const list = this.listeners.get(type) ?? [];
    list.push({ fn, capture: capture === true });
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, fn: (event: any) => void) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((item) => item.fn !== fn),
    );
  }
  emit(type: string, event: object) {
    const list = [...(this.listeners.get(type) ?? [])].sort(
      (a, b) => Number(b.capture) - Number(a.capture),
    );
    for (const { fn } of list) fn(event);
  }
}
class Canvas extends Target {
  ownerDocument = new Target();
  style = { touchAction: "" };
  clientHeight = 600;
  clientWidth = 800;
  setAttribute() {}
  releasePointerCapture() {}
}
function rig(enablePan = false, install = true) {
  const canvas = new Canvas();
  const camera = new PerspectiveCamera(48, 4 / 3, 0.1, 6000);
  camera.position.set(0, 4, 10);
  const controls = new OrbitControls(camera, canvas as unknown as HTMLElement);
  controls.enablePan = enablePan;
  const disposeBinding = install
    ? bindCameraMouse(controls, canvas as unknown as HTMLElement)
    : () => {};
  const drag = (button: number, shiftKey: boolean, shiftAtMove = shiftKey) => {
    const event = {
      button,
      shiftKey,
      ctrlKey: false,
      metaKey: false,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 100,
      clientY: 100,
    };
    canvas.emit("pointerdown", event);
    canvas.ownerDocument.emit("pointermove", {
      ...event,
      shiftKey: shiftAtMove,
      clientX: 250,
    });
    canvas.ownerDocument.emit("pointerup", event);
  };
  const dispose = () => {
    disposeBinding();
    controls.dispose();
  };
  return { camera, controls, drag, dispose };
}
describe("camera during sprint", () => {
  it("reproduces the library's Shift-drag failure when panning is disabled", () => {
    const r = rig(false, false),
      before = r.camera.position.clone();
    r.drag(0, true);
    expect(r.camera.position.distanceTo(before)).toBeLessThan(1e-8);
    r.dispose();
  });
  it.each([0, 2])(
    "rotates with button %s both with and without Shift",
    (button) => {
      const r = rig(),
        before = r.camera.position.clone();
      r.drag(button, true);
      expect(r.camera.position.distanceTo(before)).toBeGreaterThan(0.1);
      const next = r.camera.position.clone();
      r.drag(button, false);
      expect(r.camera.position.distanceTo(next)).toBeGreaterThan(0.1);
      r.dispose();
    },
  );
  it.each([
    [false, true],
    [true, false],
  ])(
    "keeps rotating if Shift changes during a drag",
    (startShift, moveShift) => {
      const r = rig(),
        before = r.camera.position.clone();
      r.drag(0, startShift, moveShift);
      expect(r.camera.position.distanceTo(before)).toBeGreaterThan(0.1);
      r.dispose();
    },
  );
  it("retains Shift-drag panning in map-style views", () => {
    const r = rig(true),
      before = r.controls.target.clone();
    r.drag(0, true);
    expect(r.controls.target.distanceTo(before)).toBeGreaterThan(0.1);
    r.dispose();
  });
  it("removes the listener and restores the library defaults on cleanup", () => {
    const canvas = new Canvas(),
      camera = new PerspectiveCamera();
    camera.position.copy(new Vector3(0, 4, 10));
    const controls = new OrbitControls(
      camera,
      canvas as unknown as HTMLElement,
    );
    controls.enablePan = false;
    const unbind = bindCameraMouse(controls, canvas as unknown as HTMLElement);
    unbind();
    const before = camera.position.clone();
    const event = {
      button: 0,
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 100,
      clientY: 100,
    };
    canvas.emit("pointerdown", event);
    canvas.ownerDocument.emit("pointermove", { ...event, clientX: 250 });
    canvas.ownerDocument.emit("pointerup", event);
    expect(camera.position.distanceTo(before)).toBeLessThan(1e-8);
    controls.dispose();
  });
});
