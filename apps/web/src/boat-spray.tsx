import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BOAT_DIMENSIONS } from "./boat-geometry";
import { BOAT_TUNING } from "./boat-motion";
import { spraySize, sprayIntensity, wakeMotion } from "./boat-spray.ts";
import {
  WAKE_VERTEX_COUNT,
  createWakeTrail,
  layoutWakeRibbon,
  pruneWakeTrail,
  pushWakeSample,
  wakeRibbonIndex,
} from "./boat-wake-trail";
import { lastLighting } from "./day-night";
import { LAKE_LEVEL } from "./swim-motion";

// Jet stream off the transom: a V wake on the water and a rooster tail of foam.
// Materials and the rooster-tail geometry are shared by every boat; the wake
// ribbon geometry is per boat. Each instance owns its transforms and a 4-float
// state that onBeforeRender copies into the shared uniforms
// (uniformsNeedUpdate), so every boat is still 2 small draws.

/** Foam lies this far above the water so it never z-fights the lake. */
const FOAM_LIFT = 0.03;
const TAIL_PARTICLES = 20;
/** Rooster-tail reach and peak height as fractions of the wake length. */
const TAIL_REACH = 0.32;
const TAIL_HEIGHT = 0.09;
/** Largest stream: a full boost, plus a 1 m margin on the bounding spheres. */
const MAX_SPRAY = spraySize(
  BOAT_TUNING.cruise * BOAT_TUNING.boostMultiplier,
  BOAT_TUNING.cruise,
);
const BOUNDS_MARGIN = 1;
/** Ribbon's largest lateral reach beyond a sample centre, plus the margin. */
const WAKE_LATERAL_PAD =
  BOAT_DIMENSIONS.beam * 0.425 +
  0.5 * MAX_SPRAY.width +
  0.3 +
  0.18 * MAX_SPRAY.width +
  BOUNDS_MARGIN;

const foam = new THREE.Color("#f6f2e6");
const time = { value: 0 };

/**
 * Wake: a world-space ribbon per boat, laid out from the transom trail each
 * frame (see boat-wake-trail.ts). `aux` carries (along, across, arm) for the
 * fragment shader; positions are metres.
 */
function createWakeGeometry() {
  const position = new THREE.Float32BufferAttribute(WAKE_VERTEX_COUNT * 3, 3);
  position.setUsage(THREE.DynamicDrawUsage);
  const aux = new THREE.Float32BufferAttribute(WAKE_VERTEX_COUNT * 3, 3);
  aux.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", position);
  geometry.setAttribute("aux", aux);
  geometry.setIndex(new THREE.BufferAttribute(wakeRibbonIndex(), 1));
  // Updated in place every frame from the trail bounds.
  geometry.boundingSphere = new THREE.Sphere();
  return geometry;
}

/** Rooster tail: `position` packs (phase 0..1, lateral −1..1, size). */
const tailGeometry = (() => {
  const packed: number[] = [];
  for (let i = 0; i < TAIL_PARTICLES; i += 1) {
    const phase = (i * 0.618034) % 1;
    const lateral = ((i * 0.414214) % 1) * 2 - 1;
    packed.push(phase, lateral, 0.7 + ((i * 0.732051) % 1) * 0.6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(packed, 3),
  );
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0.8, -2.5),
    TAIL_REACH * MAX_SPRAY.length + BOUNDS_MARGIN,
  );
  return geometry;
})();

const instanceUniforms = () => ({
  uLength: { value: 0 },
  uSpread: { value: 0 },
  uOpacity: { value: 0 },
  uIntensity: { value: 1 },
  uTime: time,
  uColor: { value: foam },
});

const wakeMaterial = new THREE.ShaderMaterial({
  uniforms: instanceUniforms(),
  vertexShader: /* glsl */ `
    attribute vec3 aux;
    varying float vAlong;
    varying float vAcross;
    void main() {
      vAlong = aux.x;
      vAcross = aux.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uIntensity;
    uniform float uTime;
    varying float vAlong;
    varying float vAcross;
    void main() {
      float edge = 1.0 - abs(vAcross);
      float fade = pow(1.0 - vAlong, 1.6) * smoothstep(0.0, 0.06, vAlong + 0.02);
      float streak = 0.72 + 0.28 * sin(vAlong * 46.0 - uTime * 7.0 + vAcross * 3.0);
      float alpha = edge * fade * streak * uOpacity * uIntensity;
      gl_FragColor = vec4(uColor * uIntensity, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  fog: false,
});

const tailMaterial = new THREE.ShaderMaterial({
  uniforms: { ...instanceUniforms(), uPixels: { value: 600 } },
  vertexShader: /* glsl */ `
    uniform float uLength;
    uniform float uSpread;
    uniform float uTime;
    uniform float uPixels;
    varying float vAlpha;
    void main() {
      float t = fract(uTime * 0.85 + position.x);
      float reach = uLength * ${TAIL_REACH.toFixed(3)};
      float height = uLength * ${TAIL_HEIGHT.toFixed(3)};
      // Thrown up and back from the transom, falling as it spreads.
      vec3 local = vec3(
        position.y * (0.15 + 0.12 * uSpread) * t,
        height * 4.0 * t * (1.0 - t),
        -reach * t
      );
      vec4 view = modelViewMatrix * vec4(local, 1.0);
      vAlpha = (1.0 - t) * min(1.0, t * 6.0);
      gl_PointSize = position.z * (0.25 + 0.5 * t) * (0.5 + 0.06 * uLength)
        * uPixels / max(-view.z, 0.5);
      gl_Position = projectionMatrix * view;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uIntensity;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float alpha = smoothstep(0.5, 0.15, d) * vAlpha * 0.8 * uOpacity * uIntensity;
      gl_FragColor = vec4(uColor * uIntensity, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
  transparent: true,
  depthWrite: false,
  fog: false,
});

// Per-boat state slots in a Float32Array.
const LENGTH = 0,
  SPREAD = 1,
  OPACITY = 2,
  INTENSITY = 3;

function applyState(material: THREE.ShaderMaterial, state: Float32Array) {
  const u = material.uniforms;
  u.uLength.value = state[LENGTH];
  u.uSpread.value = state[SPREAD];
  u.uOpacity.value = state[OPACITY];
  u.uIntensity.value = state[INTENSITY];
  material.uniformsNeedUpdate = true;
}

/**
 * Jet stream behind a boat. Mount it as a child of the yawing boat root; it
 * anchors itself at the transom on the waterline. `speed` is read every frame
 * (no React re-render): the local boat's motion speed or a remote pose's.
 */
export function BoatSpray({
  speed,
  velocity,
}: {
  speed: () => number;
  velocity?: () => readonly [number, number] | null;
}) {
  const group = useRef<THREE.Group>(null);
  const wake = useRef<THREE.Mesh>(null);
  const tail = useRef<THREE.Points>(null);
  const scene = useThree((s) => s.scene);
  const world = useMemo(() => new THREE.Vector3(), []);
  const anchor = useMemo(() => new THREE.Vector3(), []),
    localAnchor = useMemo(() => new THREE.Vector3(), []),
    localVelocity = useMemo(() => new THREE.Vector3(), []),
    rotation = useMemo(() => new THREE.Quaternion(), []),
    motion = useMemo(() => wakeMotion(0, 0), []);
  const wasSpraying = useRef(false);
  const state = useMemo(() => new Float32Array(4), []);
  const bounds = useMemo(() => new Float32Array(3), []);
  const trail = useMemo(createWakeTrail, []);
  const laidOut = useRef(0);
  const wakeGeometry = useMemo(createWakeGeometry, []);
  const spray = useMemo(() => spraySize(0, BOAT_TUNING.cruise), []);
  useEffect(() => () => wakeGeometry.dispose(), [wakeGeometry]);
  useLayoutEffect(() => {
    if (wake.current)
      // Per-sample strength is baked into the ribbon, so opacity is constant 1.
      wake.current.onBeforeRender = () => {
        const u = wakeMaterial.uniforms;
        u.uOpacity.value = 1;
        u.uIntensity.value = state[INTENSITY];
        wakeMaterial.uniformsNeedUpdate = true;
      };
    if (tail.current)
      tail.current.onBeforeRender = () => applyState(tailMaterial, state);
  }, [state]);
  useFrame(({ clock, size, viewport }, delta) => {
    const root = group.current;
    const parent = root?.parent;
    const now = clock.elapsedTime;
    time.value = now;
    tailMaterial.uniforms.uPixels.value = size.height * viewport.dpr * 0.5;
    spraySize(speed(), BOAT_TUNING.cruise, spray);
    const sprayOn = spray.opacity > 0;
    // The ribbon is portalled to the scene, so honour hidden ancestors (e.g.
    // distant idle remotes) by hand.
    let hidden = false;
    for (let a = root?.parent; a; a = a.parent)
      if (!a.visible) {
        hidden = true;
        break;
      }
    state[INTENSITY] = sprayIntensity(lastLighting());
    if (root) root.visible = sprayOn;
    if (Number.isFinite(now)) {
      if (parent && sprayOn && !hidden) {
        const v = velocity?.();
        if (v) {
          parent.getWorldQuaternion(rotation);
          localVelocity.set(v[0], 0, v[1]).applyQuaternion(rotation.invert());
        } else localVelocity.set(0, 0, speed());
        wakeMotion(localVelocity.x, localVelocity.z, motion);
        if (!wasSpraying.current) localAnchor.set(motion.x, 0, motion.z);
        else {
          const blend = 1 - Math.exp(-12 * delta);
          localAnchor.x += (motion.x - localAnchor.x) * blend;
          localAnchor.z += (motion.z - localAnchor.z) * blend;
        }
        anchor.copy(localAnchor).applyMatrix4(parent.matrixWorld);
        pushWakeSample(
          trail,
          anchor.x,
          anchor.z,
          now,
          Math.min(spray.width, MAX_SPRAY.width),
          spray.opacity,
        );
      }
      wasSpraying.current = Boolean(parent && sprayOn && !hidden);
      if (tail.current) tail.current.visible = motion.propeller;
      pruneWakeTrail(trail, now);
      // Skip layout while the trail is and was empty; lay out once more on the
      // transition to empty so the collapsed vertices are uploaded.
      if (trail.count > 0 || laidOut.current > 0) {
        const position = wakeGeometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        const aux = wakeGeometry.getAttribute("aux") as THREE.BufferAttribute;
        layoutWakeRibbon(
          trail,
          now,
          LAKE_LEVEL + FOAM_LIFT,
          position.array as Float32Array,
          aux.array as Float32Array,
          bounds,
        );
        position.needsUpdate = true;
        aux.needsUpdate = true;
        const sphere = wakeGeometry.boundingSphere;
        if (sphere) {
          sphere.center.set(bounds[0], LAKE_LEVEL + FOAM_LIFT, bounds[1]);
          sphere.radius = bounds[2] + WAKE_LATERAL_PAD;
        }
      }
      laidOut.current = trail.count;
    }
    if (wake.current) wake.current.visible = trail.count > 1 && !hidden;
    if (!root || !parent || !sprayOn) return;
    parent.getWorldPosition(world);
    root.position.set(
      0,
      LAKE_LEVEL + FOAM_LIFT - world.y,
      -BOAT_DIMENSIONS.sternExtent,
    );
    state[LENGTH] = spray.length;
    state[SPREAD] = spray.width;
    state[OPACITY] = spray.opacity;
  });
  return (
    <>
      {createPortal(
        <mesh
          ref={wake}
          geometry={wakeGeometry}
          material={wakeMaterial}
          renderOrder={2}
          visible={false}
          dispose={null}
        />,
        scene,
      )}
      <group ref={group} visible={false}>
        <points
          ref={tail}
          geometry={tailGeometry}
          material={tailMaterial}
          renderOrder={3}
          dispose={null}
        />
      </group>
    </>
  );
}
