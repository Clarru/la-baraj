/** Actual library/adapter DOM input probe, with no world or network authority. */
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { MobileControls } from "../../apps/web/src/MobileControls";
import { mobileMovement, mobileLook } from "../../apps/web/src/mobile-input";
import "../../apps/web/src/mobile.css";
function Fixture() {
  const output = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    const timer = setInterval(
      () =>
        output.current?.setAttribute(
          "data-state",
          JSON.stringify({
            move: { ...mobileMovement },
            look: { ...mobileLook },
            ids: Array.from(
              document.querySelectorAll(".mobile-stick-zone .joystick"),
            ).map((node) => node.id),
          }),
        ),
      25,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <>
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
      <output ref={output} id="input" />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
