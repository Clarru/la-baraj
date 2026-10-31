import { mobileWaterReflection } from "./mobile-water";
import { currentLighting } from "./day-night";
import { environmentDefaults, environmentTuning } from "./environment-tuning";
import { memo, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { ModelInstances, type Placement } from "./assets";
import { NearbySolids, type NaturalSolid } from "./NearbySolids";
import { isSolidVegetation } from "./vegetation-collision";
import { LAKE_LEVEL } from "./swim-motion";
import { makeRoadRibbon, makeBackgroundForest } from "./landscape-geometry";
import { useTexture, Detailed } from "@react-three/drei";
import impostorInfo from "../public/assets/impostors/manifest.json";
import {
  lake,
  roads,
  inWater,
  shoreDistance,
  terrainHeight,
  rng,
  canPlant,
  southShore,
  northShore,
  cabinSpots,
  activityClearance,
} from "./geography";

function terrainPatch(
  width: number,
  depth: number,
  sx: number,
  sz: number,
  cx: number,
  cz: number,
  xs?: number[],
  zs?: number[],
) {
  const geo = new THREE.PlaneGeometry(width, depth, sx, sz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(cx, 0, cz);
  const p = geo.attributes.position,
    colors = new Float32Array(p.count * 3),
    detail = new Uint8Array(p.count);
  const grass = new THREE.Color("#69844b"),
    shore = new THREE.Color("#b8a67b"),
    forest = new THREE.Color("#3b5836");
  for (let i = 0; i < p.count; i++) {
    if (xs && zs) {
      p.setX(i, xs[i % xs.length]);
      p.setZ(i, zs[Math.floor(i / xs.length)]);
    }
    const x = p.getX(i),
      z = p.getZ(i),
      d = shoreDistance(x, z),
      wet = inWater(x, z);
    p.setY(i, terrainHeight(x, z, d, wet));
    geo.attributes.uv.setXY(i, x / 6, z / 6);
    detail[i] = Math.round(THREE.MathUtils.clamp((d - 3) / 5, 0, 1) * 255);
    const c = grass.clone().lerp(shore, Math.max(0, 1 - d / 5));
    if (d > 30) c.lerp(forest, Math.min(0.65, (d - 30) / 170));
    c.multiplyScalar(0.95 + Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.06);
    c.toArray(colors, i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("terrainDetail", new THREE.BufferAttribute(detail, 1, true));
  geo.computeVertexNormals();
  return geo;
}
// One continuous mesh avoids overlapping LOD surfaces and cracks at patch edges.
// Axis spacing is fine around the settlement and coarse beyond it.
export function makeTerrain() {
  const edge = southShore(0) + 100;
  const axis = (segments: number[][]) =>
    segments.flatMap(([a, b, step], i) => {
      const n = Math.ceil((b - a) / step);
      return Array.from(
        { length: n + (i === segments.length - 1 ? 1 : 0) },
        (_, j) => a + ((b - a) * j) / n,
      );
    });
  const xs = axis([
    [-3150, -525, 25],
    [-525, 525, 3],
    [525, 1250, 25],
  ]);
  const zs = axis([
    [-1575, edge - 270, 25],
    [edge - 270, edge + 270, 3],
    [edge + 270, 1475, 25],
  ]);
  return [terrainPatch(1, 1, xs.length - 1, zs.length - 1, 0, 0, xs, zs)];
}
/** Keep painted grass detail off the sand, using one byte per terrain vertex. */
function groundMaterial(
  shader: Parameters<THREE.MeshStandardMaterial["onBeforeCompile"]>[0],
) {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute float terrainDetail;\nvarying float vTerrainDetail;",
    )
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvTerrainDetail=terrainDetail;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nvarying float vTerrainDetail;",
    )
    .replace(
      "#include <map_fragment>",
      `
    #ifdef USE_MAP
      vec3 grain=texture2D(map,vMapUv).rgb;
      diffuseColor.rgb*=mix(vec3(0.73,0.76,0.65),grain,0.72*vTerrainDetail);
    #endif
  `,
    );
}
// Suspense discards useMemo on an uncommitted render. Loading each GLB retried
// the whole initial scene and rebuilt this mesh ~15 times. These immutable,
// page-lifetime resources must survive those retries, like the GLTF loader cache.
let terrainResources: { patches: THREE.PlaneGeometry[] } | undefined;
export function Terrain() {
  const tex = useTexture("/assets/environment/ground-detail.webp");
  useMemo(() => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }, [tex]);
  const { patches } = (terrainResources ??= { patches: makeTerrain() });
  return (
    <>
      {patches.map((geometry, i) => (
        <RigidBody
          key={i}
          type="fixed"
          colliders="trimesh"
          userData={{ terrain: true }}
        >
          <mesh
            name="lake-terrain"
            userData={{ terrain: true }}
            geometry={geometry}
            receiveShadow
            dispose={null}
          >
            <meshStandardMaterial
              vertexColors
              onBeforeCompile={groundMaterial}
              map={i === 0 ? tex : undefined}
              roughness={0.95}
            />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
function waterGeometry() {
  const path = new THREE.Shape(
    lake.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  return new THREE.ShapeGeometry(path);
}
function waterNormals() {
  const n = 256,
    data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const u = (x / n) * Math.PI * 2,
        v = (y / n) * Math.PI * 2;
      const dx =
        0.13 * Math.sin(u * 5 + v * 3) +
        0.07 * Math.sin(u * 13 - v * 7) +
        0.04 * Math.cos(u * 23 + v * 19);
      const dy =
        0.12 * Math.cos(v * 6 - u * 2) +
        0.06 * Math.sin(v * 15 + u * 9) +
        0.03 * Math.cos(v * 21 - u * 25);
      const normal = new THREE.Vector3(dx * 0.25, dy * 0.25, 1).normalize();
      const k = (y * n + x) * 4;
      data[k] = (normal.x * 0.5 + 0.5) * 255;
      data[k + 1] = (normal.y * 0.5 + 0.5) * 255;
      data[k + 2] = (normal.z * 0.5 + 0.5) * 255;
      data[k + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
export function LakeWater({
  evening,
  forceDay,
  mobile = false,
}: {
  evening: boolean;
  forceDay: boolean;
  mobile?: boolean;
}) {
  const water = useMemo(() => {
    const w = new Water(waterGeometry(), {
      textureWidth: mobile ? 32 : 512,
      textureHeight: mobile ? 32 : 512,
      waterNormals: waterNormals(),
      sunDirection: currentLighting(evening, forceDay).sunDirection.clone(),
      sunColor: "#fff1d7",
      waterColor: "#155c62",
      distortionScale: 0.65,
      fog: true,
      side: THREE.DoubleSide,
    });
    w.rotation.x = -Math.PI / 2;
    w.position.y = LAKE_LEVEL;
    w.material.uniforms.size.value = 7.5;
    w.material.fragmentShader = w.material.fragmentShader
      .replace(
        "vec3 outgoingLight = albedo;",
        "vec3 outgoingLight = mix(albedo, waterColor * 1.3, 0.48);",
      )
      .replace("100.0, 2.0, 0.5", "240.0, 0.65, 0.5");
    if (mobile) {
      const light = currentLighting(evening, forceDay);
      w.material.uniforms.mirrorSampler.value = mobileWaterReflection(
        light.colors.sky,
        light.colors.horizon,
      );
      w.material.uniforms.textureMatrix.value.set(
        0,
        0,
        0,
        0.5,
        0,
        0,
        0,
        0.5,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
      );
      w.onBeforeRender = (_renderer, _scene, camera) => {
        camera.getWorldPosition(w.material.uniforms.eye.value);
      };
      return w;
    }
    // Waves still animate every frame. Re-render the reflected world at 20Hz,
    // rather than drawing all houses and players again at 120Hz.
    const reflect = w.onBeforeRender.bind(w);
    let reflectedAt = -Infinity;
    w.onBeforeRender = (...args) => {
      const now = performance.now();
      if (now - reflectedAt < 1000 / 20) return;
      reflectedAt = now;
      reflect(...args);
    };
    return w;
  }, [mobile]);
  let lastLightingUpdate = -Infinity;
  useFrame((_, dt) => {
    const settings = environmentTuning() ?? environmentDefaults;
    water.material.uniforms.time.value += dt * settings.water.waveSpeed;
    const now = performance.now();
    if (now - lastLightingUpdate < 250) return;
    lastLightingUpdate = now;
    const light = currentLighting(evening, forceDay);
    water.material.uniforms.sunDirection.value.copy(light.sunDirection);
    water.material.uniforms.sunColor.value.copy(light.colors.sun);
    water.material.uniforms.waterColor.value.copy(light.colors.water);
    water.material.uniforms.distortionScale.value = settings.water.distortion;
    water.material.uniforms.size.value = settings.water.size;
    if (mobile) mobileWaterReflection(light.colors.sky, light.colors.horizon);
  });
  return <primitive object={water} dispose={null} />;
}
let sharedRoadGeometry: THREE.BufferGeometry | undefined;
export function Roads() {
  const { gl } = useThree();
  const coverage = useMemo(
    () => gl.getContext().getContextAttributes()?.antialias === true,
    [gl],
  );
  const tex = useTexture("/assets/environment/asphalt.webp");
  useMemo(() => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }, [tex]);
  const geometry = (sharedRoadGeometry ??= makeRoadRibbon());
  return (
    <mesh
      name="Cincis road ribbon"
      geometry={geometry}
      receiveShadow
      dispose={null}
    >
      <meshStandardMaterial
        map={tex}
        vertexColors
        alphaToCoverage={coverage}
        transparent={!coverage}
        depthWrite={coverage}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
        roughness={1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
const vegetationData = (() => {
  const random = rng(1729),
    groups: Record<string, Placement[]> = {
      CommonTree_1: [],
      CommonTree_3: [],
      Pine_2: [],
      Pine_4: [],
      Bush_Common: [],
      Fern_1: [],
      Grass_Common_Short: [],
      Flower_3_Group: [],
      Rock_Medium_1: [],
      Rock_Medium_2: [],
    };
  const trees = ["CommonTree_1", "CommonTree_3", "Pine_2", "Pine_4"];
  // Human-scale trees stay the same size; the geography and available land expand.
  for (let i = 0; i < 1700; i++) {
    const c = cabinSpots[i % cabinSpots.length],
      x = c.x - 65 + random() * 130,
      z = southShore(x) + 6 + random() * 140;
    if (!canPlant(x, z)) continue;
    groups[trees[i % 4]].push({
      x,
      z,
      y: terrainHeight(x, z),
      scale: 0.85 + random() * 0.55,
      rotation: random() * 6.28,
    });
  }
  // Far bank: a dedicated low-cost tree representation is baked from the source assets.
  for (let i = 0; i < 3500; i++) {
    const x = -720 + random() * 1430,
      z = northShore(x) - 8 - random() * 190;
    if (inWater(x, z)) continue;
    const id = trees[i % 4] + "_Distant";
    (groups[id] ??= []).push({
      x,
      z,
      y: terrainHeight(x, z),
      scale: 1 + random() * 0.6,
      rotation: random() * 6.28,
    });
  }
  for (let i = 0; i < 2300; i++) {
    const c = cabinSpots[i % cabinSpots.length],
      x = c.x - 30 + random() * 60,
      z = southShore(x) + 4 + random() * 55;
    if (!canPlant(x, z)) continue;
    const id =
      i % 5 === 0
        ? "Bush_Common"
        : i % 5 === 1
          ? "Fern_1"
          : i % 5 === 2
            ? "Flower_3_Group"
            : "Grass_Common_Short";
    groups[id].push({
      x,
      z,
      y: terrainHeight(x, z),
      scale:
        id === "Grass_Common_Short"
          ? 0.3 + random() * 0.3
          : 0.4 + random() * 0.65,
      rotation: random() * 6.28,
    });
  }
  for (let i = 0; i < 300; i++) {
    const x = -400 + random() * 800,
      z = southShore(x) + random() * 8;
    if (inWater(x, z) || !activityClearance(x, z)) continue;
    groups[i % 2 ? "Rock_Medium_1" : "Rock_Medium_2"].push({
      x,
      z,
      y: terrainHeight(x, z) - 0.12,
      scale: 0.4 + random() * 0.7,
      rotation: random() * 6.28,
    });
  }
  return groups;
})();
const backgroundForest = makeBackgroundForest();
const naturalSolids: NaturalSolid[] = [
  ...Object.entries(vegetationData).flatMap(([id, items]) => {
    const modelId = id.replace("_Distant", "");
    const tree = /^(CommonTree|Pine)/.test(modelId);
    if (!isSolidVegetation(id)) return [];
    return items.map((item, index) => ({
      ...item,
      id: modelId,
      key: `${id}-${index}`,
      ...(tree
        ? {
            treeHeight:
              impostorInfo[modelId as keyof typeof impostorInfo].height * 0.72,
          }
        : {}),
    }));
  }),
  ...Object.entries(backgroundForest).flatMap(([id, items]) =>
    items.map((item, index) => ({
      ...item,
      id,
      key: `background-${id}-${index}`,
      treeHeight: impostorInfo[id as keyof typeof impostorInfo].height * 0.72,
    })),
  ),
];
export const environmentCounts = Object.fromEntries(
  Object.entries(vegetationData).map(([k, v]) => [k, v.length]),
);
const treeIds = ["CommonTree_1", "CommonTree_3", "Pine_2", "Pine_4"] as const;
const treeImpostorUrls = treeIds.map((id) => `/assets/impostors/${id}.png`);
// Metrics update the App every second. Keep placement identities stable so those
// renders never rebuild instance matrices, bounding spheres, or forest meshes.
export const backgroundForestCount = Object.values(backgroundForest).reduce(
  (sum, list) => sum + list.length,
  0,
);
const vegetationGroups = Object.entries(vegetationData).flatMap(
  ([id, placements]) => {
    if (id.endsWith("_Distant"))
      return [
        {
          id: id.replace("_Distant", ""),
          key: id,
          placements: [
            ...placements,
            ...backgroundForest[id.replace("_Distant", "")],
          ],
          distant: true,
          cx: 0,
          cz: 0,
          isTree: true,
          isSmall: false,
        },
      ];
    const groups = new Map<string, Placement[]>();
    for (const p of placements) {
      const key = `${Math.floor(p.x / 100)},${Math.floor(p.z / 100)}`;
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }
    const isTree = treeIds.some((treeId) => treeId === id);
    const isSmall = [
      "Grass_Common_Short",
      "Fern_1",
      "Flower_3_Group",
      "Bush_Common",
    ].includes(id);
    return [...groups].map(([key, instances]) => {
      const [gx, gz] = key.split(",").map(Number);
      return {
        id,
        key: id + key,
        placements: instances,
        distant: false,
        cx: gx * 100 + 50,
        cz: gz * 100 + 50,
        isTree,
        isSmall,
      };
    });
  },
);
type TreeImpostor = {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshBasicMaterial;
};
export const Vegetation = memo(function Vegetation({
  flat,
}: {
  flat: boolean;
}) {
  const textures = useTexture(treeImpostorUrls);
  // Four shared species resources serve every near-bank LOD cluster and far bank.
  const impostors = useMemo(
    () =>
      Object.fromEntries(
        treeIds.map((id, i) => {
          const texture = textures[i];
          texture.colorSpace = THREE.SRGBColorSpace;
          return [
            id,
            {
              geometry: distantTreeGeometry(impostorInfo[id]),
              material: new THREE.MeshBasicMaterial({
                map: texture,
                alphaTest: 0.4,
                side: THREE.DoubleSide,
                fog: true,
                color: "#c0d1be",
              }),
            },
          ];
        }),
      ),
    [textures],
  );
  useEffect(
    () => () => {
      for (const { geometry, material } of Object.values(impostors)) {
        geometry.dispose();
        material.dispose();
      }
    },
    [impostors],
  );
  return (
    <>
      <NearbySolids items={naturalSolids} />
      {vegetationGroups.map(
        ({ id, key, placements, distant, cx, cz, isTree, isSmall }) => {
          if (distant)
            return (
              <DistantTrees
                key={key}
                resources={impostors[id]}
                placements={placements}
              />
            );
          return (
            <Detailed
              key={key}
              position={[cx, 0, cz]}
              distances={[0, isTree ? 120 : isSmall ? 110 : 360]}
              hysteresis={0.12}
              autoUpdate={false}
            >
              <group position={[-cx, 0, -cz]}>
                <ModelInstances
                  id={id}
                  placements={placements}
                  flat={flat}
                  shadows={!isSmall}
                />
              </group>
              <group position={[-cx, 0, -cz]}>
                {isTree ? (
                  <DistantTrees
                    resources={impostors[id]}
                    placements={placements}
                  />
                ) : null}
              </group>
            </Detailed>
          );
        },
      )}
    </>
  );
});
function distantTreeGeometry(info: { width: number; height: number }) {
  const w = info.width / 2,
    h = info.height;
  const positions = [
    -w,
    0,
    0,
    w,
    0,
    0,
    w,
    h,
    0,
    -w,
    h,
    0,
    0,
    0,
    -w,
    0,
    0,
    w,
    0,
    h,
    w,
    0,
    h,
    -w,
  ];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  g.computeVertexNormals();
  return g;
}
function DistantTrees({
  resources,
  placements,
}: {
  resources: TreeImpostor;
  placements: Placement[];
}) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(
        resources.geometry,
        resources.material,
        placements.length,
      ),
      dummy = new THREE.Object3D();
    placements.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(p.scale);
      dummy.rotation.y = p.rotation;
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.computeBoundingSphere();
    return m;
  }, [resources, placements]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  // The parent owns the species geometry/material; this cluster owns its matrices.
  return <primitive object={mesh} dispose={null} />;
}
