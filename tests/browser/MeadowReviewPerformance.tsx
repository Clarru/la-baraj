export * from "../../apps/web/src/PerformanceLab";
import { PerformanceCamera as Actual } from "../../apps/web/src/PerformanceLab";
import { useFrame } from "@react-three/fiber";
function Offshore() {
  useFrame(({ camera, controls }) => {
    camera.position.set(0, 5, -200);
    camera.lookAt(0, 0.05, -190);
    const orbit = controls as
      | {
          target?: { set: (x: number, y: number, z: number) => void };
          update?: () => void;
        }
      | undefined;
    orbit?.target?.set(0, 0.05, -190);
    orbit?.update?.();
  });
  return null;
}
export function PerformanceCamera() {
  return new URLSearchParams(location.search).has("offshore") ? (
    <Offshore />
  ) : (
    <Actual />
  );
}
