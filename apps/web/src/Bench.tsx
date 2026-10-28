import { useMemo } from "react";
import { Group } from "three";
import { Model } from "./assets";
import { usePrefabBenches, type BenchOptions } from "./BenchRegistration";
import { cabinDesignForPlot } from "./cabin-designs";

/** A semantic bench; Model also auto-registers direct Bench assets elsewhere. */
export function Bench({
  benchId,
  height = 0.55,
  position = [0, 0, 0],
  rotation = 0,
  flat = false,
  scale = [1, 1, 1],
  facing = Math.PI,
  bench,
}: {
  benchId: string;
  height?: number;
  position?: [number, number, number];
  rotation?: number;
  flat?: boolean;
  scale?: [number, number, number];
  facing?: number;
  bench?: BenchOptions;
}) {
  const label = benchId.startsWith("campfire")
    ? "Campfire bench"
    : benchId.startsWith("fishing")
      ? "Fishing bench"
      : benchId.startsWith("picnic")
        ? "Picnic bench"
        : "Bench";
  return (
    <Model
      id="Bench"
      height={height}
      position={position}
      rotation={rotation}
      flat={flat}
      scale={scale}
      bench={{ id: benchId, label, facingOffset: facing, ...bench }}
    />
  );
}

/** Semantic sockets for benches already joined into a cabin's GLB geometry. */
export function CabinBenchSeats({ index }: { index: number }) {
  const object = useMemo(() => new Group(), []);
  const family = ["Gable", "AFrame", "Sage"][cabinDesignForPlot(index).family];
  usePrefabBenches(object, "Lake_Cabin_" + family, `cabin-${index}`);
  return <primitive object={object} />;
}
