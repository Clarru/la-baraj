import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Metres; visual origin at the boat floor, +Z forward. Grips are in the wheel's local plane. */
export const BOAT_METRICS = {
  length: 3.6,
  beam: 1.4,
  floor: 0,
  seatHeight: 0.45,
  seat: [0, 0.45, -0.55],
  wheelPivot: [0, 0.95, 0.05],
  wheelRadius: 0.19,
  wheelTilt: 0.6,
  grips: { left: [-0.19, 0, 0], right: [0.19, 0, 0] },
} as const;

export type BoatSide = "left" | "right";
const tiltAxis = new THREE.Vector3(1, 0, 0);
const wheelAxis = new THREE.Vector3(0, 0, 1);

/** Boat-local grip on the rim: spin about the wheel axis, tilt back, then add the pivot. */
export function boatGripPosition(
  side: BoatSide,
  wheelAngle: number,
): [number, number, number] {
  return new THREE.Vector3(...BOAT_METRICS.grips[side])
    .applyAxisAngle(wheelAxis, -wheelAngle)
    .applyAxisAngle(tiltAxis, BOAT_METRICS.wheelTilt)
    .add(new THREE.Vector3(...BOAT_METRICS.wheelPivot))
    .toArray();
}

type Point = readonly [number, number, number];
type Finish = "hull" | "trim" | "rubber" | "metal";
type Parts = Map<Finish, THREE.BufferGeometry[]>;
type Materials = Record<Finish, THREE.MeshStandardMaterial>;
const up = new THREE.Vector3(0, 1, 0);

function part(
  parts: Parts,
  finish: Finish,
  geometry: THREE.BufferGeometry,
  position?: Point,
  rotation?: THREE.Euler,
) {
  if (geometry.index) {
    const original = geometry;
    geometry = geometry.toNonIndexed();
    original.dispose();
  }
  if (!geometry.getAttribute("uv"))
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.getAttribute("position").count * 2),
        2,
      ),
    );
  if (rotation)
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
  if (position) geometry.translate(...position);
  const pieces = parts.get(finish) ?? [];
  pieces.push(geometry);
  parts.set(finish, pieces);
}

function box(
  parts: Parts,
  finish: Finish,
  size: Point,
  at: Point,
  rotation?: THREE.Euler,
) {
  part(parts, finish, new THREE.BoxGeometry(...size), at, rotation);
}

function tube(
  parts: Parts,
  finish: Finish,
  a: Point,
  b: Point,
  radius: number,
  segments = 12,
) {
  const start = new THREE.Vector3(...a);
  const delta = new THREE.Vector3(...b).sub(start);
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    delta.length(),
    segments,
  );
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize()),
  );
  geometry.translate(...start.addScaledVector(delta, 0.5).toArray());
  part(parts, finish, geometry);
}

function bake(
  parts: Parts,
  materials: Materials,
  group: THREE.Group,
  name: string,
) {
  for (const [finish, pieces] of parts) {
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach((piece) => piece.dispose());
    if (!geometry) throw new Error(`Could not merge boat ${name}/${finish}`);
    const mesh = new THREE.Mesh(geometry, materials[finish]);
    mesh.name = `${name}_${finish}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

const named = (name: string, parent?: THREE.Group) => {
  const group = new THREE.Group();
  group.name = name;
  parent?.add(group);
  return group;
};

/** Planform, keel and gunwale profiles for a station at z (stern -1.75, bow +1.75). */
function station(z: number) {
  const t = (z + 1.75) / 3.5;
  const bow = Math.max(0, (z - 0.6) / 1.15);
  const half = Math.max(0.02, 0.7 * Math.sqrt(1 - bow * bow));
  return { half, gunwale: 0.55 + 0.12 * t * t, keel: -0.3 + 0.16 * t * t };
}

/** Flat-shaded V hull skin (open top, closed transom) plus a timber floor. */
function hullShell(parts: Parts) {
  const stations = Array.from({ length: 24 }, (_, i) => -1.75 + (3.5 * i) / 23);
  const rings = stations.map((z) => {
    const { half, gunwale, keel } = station(z);
    return [
      [-half, gunwale, z],
      [-half * 0.82, 0, z],
      [0, keel, z],
      [half * 0.82, 0, z],
      [half, gunwale, z],
    ] as const;
  });
  const skin: number[] = [];
  const floor: number[] = [];
  const tri = (out: number[], ...p: Point[]) =>
    p.forEach((v) => out.push(...v));
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i],
      b = rings[i + 1];
    for (let j = 0; j < 4; j++) {
      tri(skin, a[j], b[j], b[j + 1]);
      tri(skin, a[j], b[j + 1], a[j + 1]);
    }
    tri(floor, a[1], b[1], b[3]);
    tri(floor, a[1], b[3], a[3]);
  }
  const transom = rings[0];
  for (let j = 1; j < 4; j++) tri(skin, transom[0], transom[j], transom[j + 1]);
  for (const [finish, vertices] of [
    ["hull", skin],
    ["trim", floor],
  ] as const) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.computeVertexNormals();
    part(parts, finish, geometry);
  }
  // Timber gunwale rails run the whole sheer line.
  for (let i = 0; i < rings.length - 1; i++)
    for (const side of [0, 4])
      tube(parts, "trim", rings[i][side], rings[i + 1][side], 0.025, 6);
}

export type BoatRig = {
  group: THREE.Group;
  /** The tilted `SteeringWheel` group at the wheel pivot. */
  wheel: THREE.Group;
  /** Child of `wheel` carrying the rim, spokes and grips; spun about local Z. */
  wheelSpin: THREE.Group;
  hull: THREE.Group;
  dispose(): void;
};

/** Rolls the whole boat so seat, console and wheel lean together; positive dips +X (left). */
export function applyBoatLean(rig: BoatRig, lean: number): void {
  rig.group.rotation.z = -lean;
}

/** Same editable geometry is used by the game and any Blender export. */
export function createBoatRig(): BoatRig {
  const group = named("Motorboat_Stylized");
  const materials: Materials = {
    hull: new THREE.MeshStandardMaterial({
      color: "#ece6d6",
      roughness: 0.42,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: "#a88d65",
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: "#1c2128",
      roughness: 0.9,
      metalness: 0,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: "#9ea5aa",
      roughness: 0.4,
      metalness: 0.7,
    }),
  };

  const hull = named("Hull", group);
  const hullParts: Parts = new Map();
  hullShell(hullParts);
  bake(hullParts, materials, hull, "Hull");

  // Timber bench; the top sits at the sit clip's seatHeight.
  const seat = named("Seat", group);
  const [, seatY, seatZ] = BOAT_METRICS.seat;
  const seatParts: Parts = new Map();
  box(
    seatParts,
    "trim",
    [0.95, seatY - 0.02, 0.42],
    [0, (seatY + 0.02) / 2, seatZ],
  );
  bake(seatParts, materials, seat, "Seat");

  const fittings = named("Fittings", group);
  const fit: Parts = new Map();
  box(
    fit,
    "trim",
    [0.95, 0.55, 0.06],
    [0, seatY + 0.3, seatZ - 0.26],
    new THREE.Euler(-0.15, 0, 0),
  );
  box(fit, "hull", [0.62, 0.55, 0.45], [0, 0.275, 0.4]);
  box(
    fit,
    "rubber",
    [0.58, 0.04, 0.4],
    [0, 0.57, 0.4],
    new THREE.Euler(0.25, 0, 0),
  );
  tube(fit, "metal", [0, 0.58, 0.32], [...BOAT_METRICS.wheelPivot], 0.03, 10);
  bake(fit, materials, fittings, "Console");

  const wheel = named("SteeringWheel", group);
  wheel.position.set(...BOAT_METRICS.wheelPivot);
  wheel.rotation.x = BOAT_METRICS.wheelTilt;
  const wheelSpin = named("WheelSpin", wheel);
  const r = BOAT_METRICS.wheelRadius;
  const spokes: Parts = new Map();
  part(spokes, "rubber", new THREE.TorusGeometry(r, 0.016, 8, 40));
  part(
    spokes,
    "metal",
    new THREE.CylinderGeometry(0.04, 0.04, 0.05, 16),
    undefined,
    new THREE.Euler(Math.PI / 2, 0, 0),
  );
  for (const angle of [0, Math.PI * 0.7, Math.PI * 1.3])
    tube(
      spokes,
      "metal",
      [0, 0, 0],
      [Math.sin(angle) * r, Math.cos(angle) * r, 0],
      0.01,
      6,
    );
  for (const side of ["left", "right"] as const)
    part(
      spokes,
      "rubber",
      new THREE.SphereGeometry(0.03, 10, 8),
      BOAT_METRICS.grips[side],
    );
  bake(spokes, materials, wheelSpin, "Wheel");

  const outboard = named("Outboard", group);
  const motor: Parts = new Map();
  box(motor, "metal", [0.3, 0.06, 0.1], [0, 0.5, -1.72]);
  box(motor, "hull", [0.26, 0.42, 0.14], [0, 0.72, -1.78]);
  tube(motor, "metal", [0, 0.55, -1.78], [0, -0.3, -1.78], 0.04, 10);
  box(motor, "hull", [0.12, 0.2, 0.16], [0, -0.3, -1.78]);
  box(motor, "rubber", [0.3, 0.04, 0.04], [0, -0.38, -1.8]);
  bake(motor, materials, outboard, "Outboard");

  return {
    group,
    wheel,
    wheelSpin,
    hull,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) geometries.add(object.geometry);
      });
      geometries.forEach((geometry) => geometry.dispose());
      Object.values(materials).forEach((material) => material.dispose());
    },
  };
}
