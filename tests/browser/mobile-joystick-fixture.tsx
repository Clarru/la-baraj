import { MobileExperience } from "../../apps/web/src/MobileExperience";
/** Actual library/adapter DOM input probe, with no world or network authority. */
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { MobileControls } from "../../apps/web/src/MobileControls";
import { mobileMovement, mobileLook } from "../../apps/web/src/mobile-input";
import "../../apps/web/src/mobile.css";
function Fixture() {
  const output = useRef<HTMLOutputElement>(null);
  const armed = useRef(false);
  useEffect(() => {
    let dropped: number | null = null,
      timer: ReturnType<typeof setTimeout>;
    const drop = (event: PointerEvent) => {
      if (
        armed.current &&
        event.target instanceof Element &&
        event.target.closest(".mobile-move")
      ) {
        armed.current = false;
        dropped = event.pointerId;
        clearTimeout(timer);
        timer = setTimeout(() => {
          dropped = null;
        }, 180);
      }
      if (event.pointerId === dropped) event.stopImmediatePropagation();
    };
    for (const type of ["pointerup", "pointercancel", "pointerleave"] as const)
      document.addEventListener(type, drop, true);
    return () => {
      clearTimeout(timer);
      for (const type of [
        "pointerup",
        "pointercancel",
        "pointerleave",
      ] as const)
        document.removeEventListener(type, drop, true);
    };
  }, []);
  useEffect(() => {
    let previous = "";
    const timer = setInterval(() => {
      const data = {
        move: { ...mobileMovement },
        look: { ...mobileLook },
        ids: Array.from(
          document.querySelectorAll(".mobile-stick-zone .joystick"),
        ).map((node) => node.id),
      };
      const json = JSON.stringify(data);
      if (output.current && json !== previous) {
        previous = json;
        output.current.setAttribute("data-state", json);
        output.current.textContent = `Move ${data.move.x.toFixed(2)}, ${data.move.y.toFixed(2)} · Look ${data.look.x.toFixed(2)}, ${data.look.y.toFixed(2)} · ${data.ids.join(" / ")}`;
      }
    }, 25);
    return () => clearInterval(timer);
  }, []);
  return (
    <MobileExperience>
      <div style={{ width: "100%", height: "100%", background: "#456852" }}>
        <MobileControls
          enabled
          moving
          prompt={null}
          mounted={false}
          busy={false}
          seatedGame={null}
          onGame={() => {}}
          onStand={() => {}}
          onChat={() => {}}
        />
        <button
          id="arm-fault"
          onClick={() => {
            armed.current = true;
          }}
          style={{
            position: "absolute",
            top: 10,
            left: "30%",
            zIndex: 20,
            minHeight: 44,
          }}
        >
          Simulate missing Move end
        </button>
        <output
          ref={output}
          id="input"
          aria-label="Native controller input"
          style={{
            position: "absolute",
            top: 72,
            left: "22%",
            maxWidth: "56%",
            color: "white",
            font: "16px Arial",
            pointerEvents: "none",
          }}
        />
      </div>
    </MobileExperience>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
