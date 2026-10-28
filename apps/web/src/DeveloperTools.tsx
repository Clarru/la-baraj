import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { ViewMode } from "./player";
export type RenderSample = { fps: number; calls: number; triangles: number };
export function DeveloperMeasurement({
  onMetrics,
}: {
  onMetrics: (sample: RenderSample) => void;
}) {
  const elapsed = useRef(0),
    frames = useRef(0);
  const { gl } = useThree();
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame((_, delta) => {
    elapsed.current += delta;
    frames.current++;
    if (elapsed.current >= 1) {
      onMetrics({
        fps: frames.current / elapsed.current,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      });
      elapsed.current = 0;
      frames.current = 0;
    }
    gl.info.reset();
  });
  return null;
}
export function DeveloperTools({
  mode,
  onMode,
  flat,
  onFlat,
  evening,
  onEvening,
  crowd,
  onCrowd,
  metrics,
}: {
  mode: ViewMode;
  onMode: (mode: ViewMode) => void;
  flat: boolean;
  onFlat: (flat: boolean) => void;
  evening: boolean;
  onEvening: (evening: boolean) => void;
  crowd: boolean;
  onCrowd: (crowd: boolean) => void;
  metrics: RenderSample | null;
}) {
  return (
    <details className="developer-tools">
      <summary>Developer tools</summary>
      <label>
        Camera{" "}
        <select
          value={mode}
          onChange={(event) => onMode(event.target.value as ViewMode)}
        >
          <option value="walk">Walk</option>
          <option value="overview">Survey</option>
          <option value="settlement">Cabins</option>
          <option value="study">Character</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={flat}
          onChange={(event) => onFlat(event.target.checked)}
        />
        Flat materials
      </label>
      <label>
        <input
          type="checkbox"
          checked={evening}
          onChange={(event) => onEvening(event.target.checked)}
        />
        Evening
      </label>
      <label>
        <input
          type="checkbox"
          checked={crowd}
          onChange={(event) => onCrowd(event.target.checked)}
        />
        Local crowd test
      </label>
      <output
        data-testid="render-metrics"
        data-metrics={JSON.stringify(metrics)}
      >
        {metrics &&
          `${Math.round(metrics.fps)} fps · ${metrics.calls} draws · ${metrics.triangles} triangles`}
      </output>
    </details>
  );
}
