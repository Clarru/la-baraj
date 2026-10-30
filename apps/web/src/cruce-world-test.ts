/** Explicit localhost-only authored QA input, consumed by the actual physics controller. */
let destination: [number, number, number] | null = null;
export const cruceWorldLab =
  import.meta.env.VITE_CRUCE_WORLD_LAB === "1" &&
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(location.hostname);
export function requestCruceTestMove(p: [number, number, number]) {
  if (cruceWorldLab) destination = p;
}
export function takeCruceTestMove() {
  const p = destination;
  destination = null;
  return p;
}

/** Authored lab evidence only; the normal build removes the probe and its data. */
import * as T from "three";
import probes from "./cruce-contact-probes.json";
import { CRUCE_TABLE } from "../../../packages/shared/cruce-station";
import type { CruceSeat } from "../../../packages/shared/cruce";
const contactSamples = new Map<
  CruceSeat,
  {
    seat: CruceSeat;
    at: number;
    rootY: number;
    hipMm: number[];
    padMm: Record<string, number> | null;
    thumbMm: number | null;
  }
>();
export function recordCruceContact(
  object: T.Object3D,
  seat: CruceSeat,
  fan?: T.Object3D,
) {
  if (!cruceWorldLab) return;
  object.updateWorldMatrix(true, true);
  const hips = object.getObjectByName(probes.hip.mesh) as
    T.SkinnedMesh | undefined;
  const hand = object.getObjectByName(probes.tableHand.mesh) as
    T.SkinnedMesh | undefined;
  if (!hips?.isSkinnedMesh || !hand?.isSkinnedMesh) return;
  hips.skeleton.update();
  hand.skeleton.update();
  const point = (mesh: T.SkinnedMesh, index: number) =>
    mesh
      .getVertexPosition(index, new T.Vector3())
      .applyMatrix4(mesh.matrixWorld);
  const mm = (value: number) => Math.round(value * 10000) / 10;
  const hipMm = (["left", "right"] as const).map((side) =>
    mm(
      Math.min(...probes.hip[side].map((p) => point(hips, p.index).y)) -
        (CRUCE_TABLE.ground + CRUCE_TABLE.seatSurface),
    ),
  );
  const padMm = fan
    ? Object.fromEntries(
        Object.entries(probes.tableHand.digits).map(([digit, points]) => [
          digit,
          mm(
            Math.min(...points.map((p) => point(hand, p.index).y)) -
              (CRUCE_TABLE.ground + CRUCE_TABLE.woodSurface),
          ),
        ]),
      )
    : null;
  const thumbMm = fan
    ? mm(
        Math.min(
          ...probes.gripThumb.points.map((p) =>
            Math.abs(fan.worldToLocal(point(hand, p.index)).z),
          ),
        ),
      )
    : null;
  contactSamples.set(seat, {
    seat,
    at: performance.now(),
    rootY: object.getWorldPosition(new T.Vector3()).y,
    hipMm,
    padMm,
    thumbMm,
  });
}
export function cruceContactSnapshot() {
  return [...contactSamples.values()].filter(
    (v) => performance.now() - v.at < 500,
  );
}
