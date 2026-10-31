/** Actual Canvas lifecycle regression: parent updates must not undo the mobile budget. */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { MobileFrameDriver } from "../../apps/web/src/MobileFrameDriver";
function Fixture() {
  const [revision, setRevision] = useState(0),
    [ratio, setRatio] = useState(1),
    [covered, setCovered] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setRevision((n) => n + 1), 100);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <div data-revision={revision} style={{ width: "100vw", height: "100vh" }}>
        <Canvas frameloop="never" dpr={ratio}>
          <MobileFrameDriver covered={covered} onPixelRatio={setRatio} />
        </Canvas>
      </div>
      <button
        id="cover"
        style={{ position: "fixed", top: 0 }}
        onClick={() => setCovered((c) => !c)}
      >
        Toggle covered
      </button>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
