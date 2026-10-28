import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Metres; ground at zero, +Z forward. Foot contacts are forefoot bone targets. */
export const SCOOTER_METRICS = {
  wheelRadius: 0.108,
  wheelbase: 0.88,
  rearAxle: [0, 0.108, -0.44],
  frontAxle: [0, 0.108, 0.44],
  deckTop: 0.18,
  deckLength: 0.6,
  deckWidth: 0.195,
  feet: { left: [-0.045, 0.205, 0.12], right: [0.045, 0.205, -0.16] },
  grips: { left: [-0.26, 1.1, 0.3], right: [0.26, 1.1, 0.3] },
  steeringPivot: [0, 0.27, 0.395],
  steeringTop: [0, 1.1, 0.3],
  maxSteeringAngle: 0.35,
} as const;

export type ScooterSide = "left" | "right";
export type ScooterMotion = { speed: number; steer: number; dt: number };
export type ScooterMotionState = { wheelAngle: number; steeringAngle: number };
const steeringOrigin = new THREE.Vector3(...SCOOTER_METRICS.steeringPivot);
const steeringDirection = new THREE.Vector3(...SCOOTER_METRICS.steeringTop)
  .sub(steeringOrigin)
  .normalize();

/** Angle is the actual visible steering angle in radians, supplied by ScooterHandle. */
export function scooterGripPosition(
  side: ScooterSide,
  steeringAngle: number,
): [number, number, number] {
  const angle = Number.isFinite(steeringAngle)
    ? THREE.MathUtils.clamp(
        steeringAngle,
        -SCOOTER_METRICS.maxSteeringAngle,
        SCOOTER_METRICS.maxSteeringAngle,
      )
    : 0;
  return new THREE.Vector3(...SCOOTER_METRICS.grips[side])
    .sub(steeringOrigin)
    .applyAxisAngle(steeringDirection, angle)
    .add(steeringOrigin)
    .toArray();
}

/** Mutates a reusable state object; steering input is normalized -1..1. */
export function advanceScooterMotion(
  state: ScooterMotionState,
  motion: ScooterMotion,
): void {
  const dt = Number.isFinite(motion.dt)
    ? Math.max(0, Math.min(motion.dt, 0.1))
    : 0;
  const speed = Number.isFinite(motion.speed) ? motion.speed : 0;
  const steer = Number.isFinite(motion.steer)
    ? THREE.MathUtils.clamp(motion.steer, -1, 1)
    : 0;
  state.wheelAngle =
    (state.wheelAngle + (speed * dt) / SCOOTER_METRICS.wheelRadius) %
    (Math.PI * 2);
  state.steeringAngle = THREE.MathUtils.damp(
    state.steeringAngle,
    steer * SCOOTER_METRICS.maxSteeringAngle,
    12,
    dt,
  );
}

type Point = readonly [number, number, number];
type Finish =
  | "body"
  | "edge"
  | "rubber"
  | "tape"
  | "silver"
  | "red"
  | "amber"
  | "lamp"
  | "screen";
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

function roundBox(
  parts: Parts,
  finish: Finish,
  size: Point,
  at: Point,
  bevel = 0.004,
  rotation?: THREE.Euler,
) {
  const [width, height, length] = size;
  const radius = Math.min(bevel, width / 3, length / 3);
  const shape = new THREE.Shape();
  const w = width - radius,
    l = length - radius;
  const x = -w / 2,
    z = -l / 2;
  shape.moveTo(x + radius, z);
  shape.lineTo(x + w - radius, z);
  shape.quadraticCurveTo(x + w, z, x + w, z + radius);
  shape.lineTo(x + w, z + l - radius);
  shape.quadraticCurveTo(x + w, z + l, x + w - radius, z + l);
  shape.lineTo(x + radius, z + l);
  shape.quadraticCurveTo(x, z + l, x, z + l - radius);
  shape.lineTo(x, z + radius);
  shape.quadraticCurveTo(x, z, x + radius, z);
  const depthBevel = Math.min(height / 4, bevel / 2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height - depthBevel * 2,
    bevelEnabled: true,
    bevelSize: radius / 2,
    bevelThickness: depthBevel,
    bevelSegments: 2,
    curveSegments: 4,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height / 2 - depthBevel, 0);
  part(parts, finish, geometry, at, rotation);
}

function rim(
  parts: Parts,
  finish: Finish,
  at: Point,
  radius: number,
  thickness: number,
  segments = 48,
) {
  part(
    parts,
    finish,
    new THREE.TorusGeometry(radius, thickness, 6, segments),
    at,
    new THREE.Euler(0, Math.PI / 2, 0),
  );
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
    if (!geometry) throw new Error(`Could not merge scooter ${name}/${finish}`);
    const mesh = new THREE.Mesh(geometry, materials[finish]);
    mesh.name = `${name}_${finish}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

function fender(
  parts: Parts,
  center: Point,
  start = -0.18,
  end = Math.PI + 0.18,
) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const radius = 0.124,
    thickness = 0.008,
    width = 0.087;
  for (let i = 0; i <= 32; i++) {
    const a = start + ((end - start) * i) / 32;
    for (const [x, r] of [
      [-width / 2, radius],
      [width / 2, radius],
      [-width / 2, radius - thickness],
      [width / 2, radius - thickness],
    ]) {
      vertices.push(
        center[0] + x,
        center[1] + Math.sin(a) * r,
        center[2] + Math.cos(a) * r,
      );
    }
    if (i < 32) {
      const p = i * 4,
        n = p + 4;
      for (const [a, b, c, d] of [
        [p, p + 1, n + 1, n],
        [p + 2, n + 2, n + 3, p + 3],
        [p, n, n + 2, p + 2],
        [p + 1, p + 3, n + 3, n + 1],
      ])
        indices.push(a, b, c, a, c, d);
    }
  }
  indices.push(0, 2, 3, 0, 3, 1, 128, 129, 131, 128, 131, 130);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  part(parts, "body", geometry);
}

function coil(parts: Parts, a: Point, b: Point, radius = 0.019, turns = 5) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const axis = end.clone().sub(start);
  const align = new THREE.Quaternion().setFromUnitVectors(
    up,
    axis.clone().normalize(),
  );
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= turns * 18; i++) {
    const t = i / (turns * 18),
      angle = t * turns * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * radius,
        axis.length() * t,
        Math.sin(angle) * radius,
      )
        .applyQuaternion(align)
        .add(start),
    );
  }
  part(
    parts,
    "red",
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      turns * 18,
      0.0042,
      7,
      false,
    ),
  );
}

function wheel(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = "Wheel";
  const parts: Parts = new Map();
  part(
    parts,
    "rubber",
    new THREE.TorusGeometry(0.084, 0.024, 12, 48),
    undefined,
    new THREE.Euler(0, Math.PI / 2, 0),
  );
  tube(parts, "edge", [-0.034, 0, 0], [0.034, 0, 0], 0.073, 32);
  tube(parts, "body", [-0.038, 0, 0], [0.038, 0, 0], 0.062, 24);
  tube(parts, "edge", [-0.052, 0, 0], [0.052, 0, 0], 0.015, 12);
  for (const side of [-1, 1]) {
    rim(parts, "silver", [side * 0.036, 0, 0], 0.071, 0.0035);
    rim(parts, "edge", [side * 0.038, 0, 0], 0.056, 0.0025, 32);
    tube(parts, "silver", [side * 0.05, 0, 0], [side * 0.054, 0, 0], 0.009, 8);
  }
  // Broad diagonal grooves read at game distance, with no tire texture download.
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2;
    for (const side of [-1, 1]) {
      part(
        parts,
        "edge",
        new THREE.BoxGeometry(0.015, 0.0009, 0.0025),
        [side * 0.013, Math.sin(angle) * 0.1067, Math.cos(angle) * 0.1067],
        new THREE.Euler(-angle + Math.PI / 2, side * 0.38, 0),
      );
    }
  }
  bake(parts, materials, group, "HubMotor");
  return group;
}

/** Compact original stroke lettering keeps the product identifier texture-free. */
function wordmark(
  parts: Parts,
  at: Point,
  height: number,
  rotation: THREE.Euler,
) {
  const glyphs: Record<string, number[][]> = {
    Q: [
      [0.2, 0, 0.8, 0, 1, 0.2, 1, 0.8, 0.8, 1, 0.2, 1, 0, 0.8, 0, 0.2, 0.2, 0],
      [0.6, 0.3, 1.1, -0.1],
    ],
    U: [[0, 1, 0, 0.2, 0.2, 0, 0.8, 0, 1, 0.2, 1, 1]],
    I: [
      [0.1, 1, 0.9, 1],
      [0.5, 1, 0.5, 0],
      [0.1, 0, 0.9, 0],
    ],
    C: [[1, 0.9, 0.8, 1, 0.2, 1, 0, 0.8, 0, 0.2, 0.2, 0, 0.8, 0, 1, 0.1]],
    K: [
      [0, 0, 0, 1],
      [1, 1, 0, 0.45, 1, 0],
    ],
    V: [[0, 1, 0.5, 0, 1, 1]],
    O: [
      [0.2, 0, 0.8, 0, 1, 0.2, 1, 0.8, 0.8, 1, 0.2, 1, 0, 0.8, 0, 0.2, 0.2, 0],
    ],
    L: [[0, 1, 0, 0, 1, 0]],
    T: [
      [0, 1, 1, 1],
      [0.5, 1, 0.5, 0],
    ],
    "9": [
      [
        0, 0.2, 0.2, 0, 0.8, 0, 1, 0.2, 1, 0.8, 0.8, 1, 0.2, 1, 0, 0.8, 0, 0.6,
        0.2, 0.5, 1, 0.5,
      ],
    ],
  };
  const lettering: Parts = new Map();
  let cursor = 0;
  for (const [index, char] of [..."QUICKVOLT9"].entries()) {
    for (const path of glyphs[char])
      for (let i = 0; i < path.length - 2; i += 2) {
        tube(
          lettering,
          index >= 5 && index < 9 ? "red" : "silver",
          [cursor + path[i] * height * 0.6, path[i + 1] * height, 0],
          [cursor + path[i + 2] * height * 0.6, path[i + 3] * height, 0],
          height * 0.045,
          5,
        );
      }
    cursor += height * 0.86;
  }
  for (const [finish, pieces] of lettering)
    for (const geometry of pieces) part(parts, finish, geometry, at, rotation);
}

export type ScooterRig = {
  group: THREE.Group;
  steering: THREE.Group;
  frontWheel: THREE.Group;
  rearWheel: THREE.Group;
  kickstand: THREE.Group;
  dispose(): void;
};

/** Same editable geometry is used by the game and the GLB/Blender export. */
export function createScooterRig(): ScooterRig {
  const group = new THREE.Group();
  group.name = "QuickVolt9_Stylized";
  const materials: Materials = {
    body: new THREE.MeshStandardMaterial({
      color: "#344153",
      roughness: 0.47,
      metalness: 0.5,
    }),
    edge: new THREE.MeshStandardMaterial({
      color: "#202a35",
      roughness: 0.55,
      metalness: 0.4,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: "#171d24",
      roughness: 0.9,
      metalness: 0,
    }),
    tape: new THREE.MeshStandardMaterial({
      color: "#777b88",
      roughness: 0.96,
      metalness: 0,
    }),
    silver: new THREE.MeshStandardMaterial({
      color: "#b2b6b9",
      roughness: 0.37,
      metalness: 0.76,
    }),
    red: new THREE.MeshStandardMaterial({
      color: "#dc3528",
      roughness: 0.38,
      metalness: 0.25,
    }),
    amber: new THREE.MeshStandardMaterial({
      color: "#ed9d31",
      roughness: 0.42,
      metalness: 0.1,
    }),
    lamp: new THREE.MeshStandardMaterial({
      color: "#fff1bf",
      emissive: "#ffe2a0",
      emissiveIntensity: 1.2,
      roughness: 0.28,
      metalness: 0,
    }),
    screen: new THREE.MeshStandardMaterial({
      color: "#55a7b6",
      emissive: "#18718a",
      emissiveIntensity: 0.4,
      roughness: 0.22,
      metalness: 0.2,
    }),
  };
  const chassis = new THREE.Group();
  chassis.name = "BatteryDeck_RearSuspension";
  group.add(chassis);
  const parts: Parts = new Map();
  roundBox(parts, "body", [0.195, 0.052, 0.6], [0, 0.149, 0], 0.018);
  roundBox(parts, "edge", [0.18, 0.008, 0.566], [0, 0.174, 0], 0.016);
  for (const side of [-1, 1])
    roundBox(
      parts,
      "tape",
      [0.037, 0.002, 0.5],
      [side * 0.052, 0.179, 0],
      0.006,
    );
  for (const side of [-1, 1]) {
    roundBox(
      parts,
      "edge",
      [0.008, 0.015, 0.42],
      [side * 0.098, 0.142, -0.025],
      0.003,
    );
    tube(
      parts,
      "edge",
      [side * 0.041, 0.151, -0.28],
      [side * 0.051, 0.108, -0.44],
      0.018,
      10,
    );
    tube(
      parts,
      "silver",
      [side * 0.053, 0.108, -0.44],
      [side * 0.061, 0.108, -0.44],
      0.011,
      8,
    );
    tube(
      parts,
      "edge",
      [side * 0.027, 0.14, -0.28],
      [side * 0.027, 0.15, -0.39],
      0.009,
      10,
    );
    coil(
      parts,
      [side * 0.027, 0.145, -0.3],
      [side * 0.027, 0.15, -0.382],
      0.012,
      4,
    );
  }
  fender(parts, SCOOTER_METRICS.rearAxle, 0.03, Math.PI + 0.08);
  roundBox(
    parts,
    "red",
    [0.055, 0.018, 0.021],
    [0, 0.193, -0.547],
    0.006,
    new THREE.Euler(-0.45, 0, 0),
  );
  // Folding deck neck and its chunky bolted cheek plates.
  tube(parts, "body", [0, 0.15, 0.26], [0, 0.22, 0.318], 0.032, 16);
  tube(parts, "body", [0, 0.22, 0.318], [0, 0.312, 0.382], 0.032, 16);
  for (const side of [-1, 1]) {
    roundBox(
      parts,
      "body",
      [0.018, 0.13, 0.066],
      [side * 0.038, 0.233, 0.321],
      0.009,
      new THREE.Euler(0.55, 0, 0),
    );
    for (const [y, z] of [
      [0.185, 0.296],
      [0.253, 0.344],
      [0.305, 0.377],
    ])
      tube(
        parts,
        "silver",
        [side * 0.049, y, z],
        [side * 0.054, y, z],
        0.006,
        8,
      );
  }
  roundBox(
    parts,
    "red",
    [0.03, 0.013, 0.028],
    [0.043, 0.3, 0.326],
    0.004,
    new THREE.Euler(0.3, 0, 0),
  );
  roundBox(parts, "edge", [0.022, 0.012, 0.026], [0.104, 0.139, -0.12], 0.003);
  wordmark(
    parts,
    [0.099, 0.148, 0.1],
    0.009,
    new THREE.Euler(0, Math.PI / 2, 0),
  );
  bake(parts, materials, chassis, "Deck");
  const rearWheel = wheel(materials);
  rearWheel.name = "RearWheel";
  rearWheel.position.set(...SCOOTER_METRICS.rearAxle);
  group.add(rearWheel);

  const steeringAxis = new THREE.Group();
  steeringAxis.name = "HeadsetAxis";
  steeringAxis.position.copy(steeringOrigin);
  steeringAxis.quaternion.setFromUnitVectors(up, steeringDirection);
  group.add(steeringAxis);
  const steering = new THREE.Group();
  steering.name = "Steering";
  steeringAxis.add(steering);
  const unrotate = new THREE.Group();
  unrotate.quaternion.copy(steeringAxis.quaternion).invert();
  steering.add(unrotate);
  const cockpit = new THREE.Group();
  cockpit.name = "Stem_Fork_Cockpit";
  cockpit.position.copy(steeringOrigin).negate();
  unrotate.add(cockpit);
  const controls: Parts = new Map();
  // Telescoping stem: soft square-edged lower housing and slender upper tube.
  const stemBottom: Point = [0, 0.35, 0.386],
    stemShoulder: Point = [0, 0.83, 0.331],
    stemTop: Point = [0, 1.1, 0.3];
  roundBox(
    controls,
    "body",
    [0.056, 0.48, 0.044],
    [0, 0.59, 0.3585],
    0.005,
    new THREE.Euler(-Math.atan2(0.055, 0.48), 0, 0),
  );
  tube(controls, "edge", [0, 0.81, 0.333], stemTop, 0.014, 12);
  tube(controls, "edge", [0, 0.805, 0.334], [0, 0.84, 0.33], 0.031, 12);
  roundBox(
    controls,
    "body",
    [0.022, 0.026, 0.026],
    [-0.028, 0.823, 0.331],
    0.004,
  );
  tube(controls, "edge", [0, 0.335, 0.388], [0, 0.385, 0.382], 0.031, 12);
  wordmark(
    controls,
    [0.009, 0.51, 0.392],
    0.018,
    new THREE.Euler(-Math.atan2(0.055, 0.48), 0, Math.PI / 2),
  );
  for (const x of [-0.016, 0.016])
    for (const y of [0.347, 0.373])
      tube(controls, "silver", [x, y, 0.41], [x, y, 0.415], 0.0035, 8);
  tube(controls, "edge", [0, 0.26, 0.397], [0, 0.335, 0.388], 0.016, 12);
  coil(controls, [0, 0.265, 0.397], [0, 0.325, 0.39], 0.023, 5);
  tube(controls, "edge", [0, 0.257, 0.398], [0, 0.267, 0.397], 0.029, 12);
  tube(controls, "edge", [0, 0.325, 0.39], [0, 0.34, 0.389], 0.03, 12);
  for (const side of [-1, 1]) {
    tube(
      controls,
      "body",
      [side * 0.043, 0.26, 0.402],
      [side * 0.049, 0.108, 0.44],
      0.019,
      12,
    );
    roundBox(
      controls,
      "amber",
      [0.004, 0.036, 0.012],
      [side * 0.067, 0.166, 0.43],
      0.003,
      new THREE.Euler(0.1, 0, 0),
    );
    for (const [y, z] of [
      [0.238, 0.409],
      [0.108, 0.44],
    ])
      tube(
        controls,
        "silver",
        [side * 0.058, y, z],
        [side * 0.065, y, z],
        0.0075,
        8,
      );
  }
  fender(controls, SCOOTER_METRICS.frontAxle, 0.08, Math.PI + 0.25);
  // Rotor belongs to the rolling wheel; caliper stays on the fork.
  const rotor: Parts = new Map();
  tube(rotor, "silver", [-0.044, 0, 0], [-0.047, 0, 0], 0.052, 32);
  tube(rotor, "edge", [-0.048, 0, 0], [-0.049, 0, 0], 0.037, 24);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    tube(
      rotor,
      "edge",
      [-0.049, Math.sin(a) * 0.045, Math.cos(a) * 0.045],
      [-0.051, Math.sin(a) * 0.045, Math.cos(a) * 0.045],
      0.0032,
      6,
    );
  }
  roundBox(
    controls,
    "edge",
    [0.022, 0.036, 0.027],
    [-0.047, 0.15, 0.416],
    0.005,
  );
  // Compact warm headlight above the front guard.
  tube(controls, "edge", [0, 0.245, 0.454], [0, 0.245, 0.49], 0.027, 16);
  tube(controls, "silver", [0, 0.245, 0.488], [0, 0.245, 0.495], 0.0245, 16);
  part(
    controls,
    "lamp",
    new THREE.CircleGeometry(0.0215, 24),
    [0, 0.245, 0.496],
  );
  tube(controls, "edge", [-0.19, 1.1, 0.3], [0.19, 1.1, 0.3], 0.012, 12);
  tube(controls, "body", [0, 1.082, 0.3], [0, 1.115, 0.3], 0.022, 12);
  for (const side of [-1, 1]) {
    tube(
      controls,
      "red",
      [side * 0.043, 1.1, 0.3],
      [side * 0.058, 1.1, 0.3],
      0.015,
      12,
    );
    tube(
      controls,
      "edge",
      [side * 0.18, 1.1, 0.3],
      [side * 0.194, 1.1, 0.3],
      0.023,
      12,
    );
    tube(
      controls,
      "rubber",
      [side * 0.192, 1.1, 0.3],
      [side * 0.286, 1.1, 0.3],
      0.0205,
      16,
    );
    tube(
      controls,
      "edge",
      [side * 0.282, 1.1, 0.3],
      [side * 0.29, 1.1, 0.3],
      0.0215,
      16,
    );
    for (let i = 0; i < 4; i++)
      tube(
        controls,
        "edge",
        [side * (0.207 + i * 0.021), 1.1, 0.3],
        [side * (0.21 + i * 0.021), 1.1, 0.3],
        0.0208,
        12,
      );
    tube(
      controls,
      "edge",
      [side * 0.171, 1.1, 0.3],
      [side * 0.171, 1.08, 0.334],
      0.011,
      10,
    );
    tube(
      controls,
      "edge",
      [side * 0.171, 1.08, 0.334],
      [side * 0.262, 1.074, 0.359],
      0.006,
      10,
    );
    part(controls, "edge", new THREE.SphereGeometry(0.008, 8, 6), [
      side * 0.262,
      1.074,
      0.359,
    ]);
  }
  // Upward-facing display with a blue ring, throttle and red control button.
  roundBox(
    controls,
    "edge",
    [0.065, 0.025, 0.049],
    [-0.105, 1.112, 0.3],
    0.01,
    new THREE.Euler(-0.35, 0, 0),
  );
  part(
    controls,
    "screen",
    new THREE.TorusGeometry(0.016, 0.002, 6, 24),
    [-0.105, 1.128, 0.296],
    new THREE.Euler(-Math.PI / 2 - 0.35, 0, 0),
  );
  roundBox(
    controls,
    "screen",
    [0.014, 0.001, 0.005],
    [-0.105, 1.129, 0.296],
    0.001,
  );
  part(
    controls,
    "red",
    new THREE.SphereGeometry(0.004, 8, 6),
    [-0.08, 1.123, 0.307],
  );
  tube(controls, "edge", [0.145, 1.105, 0.3], [0.145, 1.123, 0.3], 0.012, 10);
  const cable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.17, 1.08, 0.337),
    new THREE.Vector3(-0.12, 0.93, 0.36),
    new THREE.Vector3(-0.035, 0.82, 0.36),
    new THREE.Vector3(-0.032, 0.38, 0.42),
    new THREE.Vector3(-0.05, 0.18, 0.435),
  ]);
  part(controls, "rubber", new THREE.TubeGeometry(cable, 28, 0.0045, 6, false));
  bake(controls, materials, cockpit, "SteeringAssembly");
  const frontWheel = rearWheel.clone(true);
  frontWheel.name = "FrontWheel";
  frontWheel.position.set(...SCOOTER_METRICS.frontAxle);
  cockpit.add(frontWheel);
  bake(rotor, materials, frontWheel, "FrontBrakeRotor");

  const kickstand = new THREE.Group();
  kickstand.name = "Kickstand_ParkedOnly";
  group.add(kickstand);
  const stand: Parts = new Map();
  tube(stand, "edge", [-0.105, 0.14, -0.08], [-0.151, 0.008, -0.1], 0.006, 10);
  roundBox(stand, "edge", [0.027, 0.008, 0.022], [-0.153, 0.006, -0.1], 0.003);
  tube(
    stand,
    "silver",
    [-0.105, 0.136, -0.08],
    [-0.113, 0.136, -0.08],
    0.005,
    8,
  );
  bake(stand, materials, kickstand, "Kickstand");
  return {
    group,
    steering,
    frontWheel,
    rearWheel,
    kickstand,
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
