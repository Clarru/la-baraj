import { useLayoutEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { registerBench } from "./bench-registry";
import type { BenchDefinition } from "./seating-types";

export type BenchOptions = {
  id?: string;
  label?: string;
  facingOffset?: number;
  capacity?: number;
  endMargin?: number;
  /** Model-local seat/floor heights; useful for a bench with a backrest. */
  seatSurfaceHeight?: number;
  floorOffset?: number;
};
function useRegistrations(read: () => BenchDefinition[]) {
  const entries = useRef(
    new Map<string, { signature: string; dispose: () => void }>(),
  );
  // A parent placement can change without changing the imported geometry. Compare
  // values after each commit; stable transforms never churn occupied reservations.
  useLayoutEffect(() => {
    const definitions = read(),
      seen = new Set<string>();
    for (const definition of definitions) {
      seen.add(definition.id);
      const signature = JSON.stringify(definition),
        previous = entries.current.get(definition.id);
      if (previous?.signature === signature) continue;
      const dispose = registerBench(definition);
      previous?.dispose(); // stale-owner cleanup cannot remove its replacement
      entries.current.set(definition.id, { signature, dispose });
    }
    for (const [id, entry] of entries.current)
      if (!seen.has(id)) {
        entry.dispose();
        entries.current.delete(id);
      }
  });
  useLayoutEffect(
    () => () => {
      for (const entry of entries.current.values()) entry.dispose();
      entries.current.clear();
    },
    [],
  );
}
const coordinateKey = (value: number) =>
  String(Math.round(value * 1000) / 1000);

/** All Model assets identified as Bench register automatically, including nested transforms. */
export function useModelBench(
  ref: RefObject<THREE.Group | null>,
  assetId: string,
  dimensions: { width: number; depth: number; height: number },
  options?: BenchOptions,
) {
  useRegistrations(() => {
    const object = ref.current;
    if (!object || (assetId !== "Bench" && !options)) return [];
    object.updateWorldMatrix(true, false);
    const origin = object.getWorldPosition(new THREE.Vector3());
    const scale = object.getWorldScale(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, 1).transformDirection(
      object.matrixWorld,
    );
    const facing =
      Math.atan2(forward.x, forward.z) + (options?.facingOffset ?? 0);
    const id =
      options?.id ??
      `bench:${assetId}:${[origin.x, origin.y, origin.z, facing].map(coordinateKey).join(":")}`;
    const surface = new THREE.Vector3(
      0,
      options?.seatSurfaceHeight ?? dimensions.height,
      0,
    ).applyMatrix4(object.matrixWorld);
    const floor = new THREE.Vector3(
      0,
      options?.floorOffset ?? 0,
      0,
    ).applyMatrix4(object.matrixWorld);
    object.userData.kind = "bench";
    object.userData.benchId = id;
    const definition: BenchDefinition = {
      id,
      label: options?.label ?? "Bench",
      center: [surface.x, surface.y, surface.z],
      width: dimensions.width * Math.abs(scale.x),
      depth: dimensions.depth * Math.abs(scale.z),
      floorHeight: floor.y,
      facing,
      capacity: options?.capacity,
      endMargin: options?.endMargin,
    };
    return [definition];
  });
}

export type PrefabBenchSocket = {
  id: string;
  center: [number, number, number];
  width: number;
  depth: number;
  floorHeight: number;
  facing?: number;
  label?: string;
  endMargin?: number;
};
// Authored socket metadata for the joined GLBs. Coordinates follow the cabin's
// export space, not its final world placement. The complete mesh has no separate
// bench nodes, so geometry-name guessing cannot recover these semantic objects.
const currentCabinSockets: Record<string, PrefabBenchSocket[]> = {
  Lake_Cabin_Gable: [
    {
      id: "porch",
      center: [-1.2, 1.12, 3.67],
      width: 1.6,
      depth: 0.46,
      floorHeight: 0.6,
      endMargin: 0.1,
    },
  ],
  Lake_Cabin_AFrame: [-1.8, 1.8].map((x, i) => ({
    id: `porch-${i}`,
    center: [x, 1.12, 3.87],
    width: 1.6,
    depth: 0.46,
    floorHeight: 0.6,
    endMargin: 0.1,
  })),
};
export function usePrefabBenches(
  object: THREE.Object3D,
  assetId: string,
  instanceId: string,
) {
  useRegistrations(() => {
    object.updateWorldMatrix(true, false);
    // Future GLBs can ship explicit sockets in extras instead of editing this catalog.
    const sockets =
      (object.userData.benches as PrefabBenchSocket[] | undefined) ??
      currentCabinSockets[assetId] ??
      [];
    const scale = object.getWorldScale(new THREE.Vector3());
    const definitions = sockets.map((socket) => {
      const center = new THREE.Vector3(...socket.center).applyMatrix4(
        object.matrixWorld,
      );
      const floor = new THREE.Vector3(
        socket.center[0],
        socket.floorHeight,
        socket.center[2],
      ).applyMatrix4(object.matrixWorld);
      const forward = new THREE.Vector3(
        Math.sin(socket.facing ?? 0),
        0,
        Math.cos(socket.facing ?? 0),
      ).transformDirection(object.matrixWorld);
      return {
        id: `${instanceId}:bench:${socket.id}`,
        label: socket.label ?? "Porch bench",
        center: center.toArray() as [number, number, number],
        width: socket.width * Math.abs(scale.x),
        depth: socket.depth * Math.abs(scale.z),
        floorHeight: floor.y,
        facing: Math.atan2(forward.x, forward.z),
        endMargin: socket.endMargin,
      };
    });
    object.userData.seatingBenchIds = definitions.map((d) => d.id);
    return definitions;
  });
}
