import * as THREE from "three";
import {
  arcadeDisplayBoard,
  arcadeGpuTilesVisible,
  drawArcadeTileFace,
  type ArcadeScreenState,
  type TileAnimation,
} from "./arcade2048-screen";

export type ArcadeTilePose = {
  value: number;
  x: number;
  y: number;
  scale: number;
};
/** Reuse the caller's 16 slots rather than allocating frame objects during a slide. */
export function writeArcadeTilePoses(
  board: readonly number[],
  animation: TileAnimation | null,
  now: number,
  out: ArcadeTilePose[],
) {
  let count = 0;
  const t = animation
    ? THREE.MathUtils.clamp((now - animation.started) / 150, 0, 1)
    : 1;
  const add = (value: number, x: number, y: number, scale = 1) => {
    const p = out[count] ?? (out[count] = { value: 0, x: 0, y: 0, scale: 1 });
    p.value = value;
    p.x = x;
    p.y = y;
    p.scale = scale;
    count++;
  };
  if (animation && t < 0.72) {
    const eased = 1 - (1 - t / 0.72) ** 3;
    for (const m of animation.motions)
      add(
        m.value,
        48 + ((m.from % 4) + ((m.to % 4) - (m.from % 4)) * eased) * 106,
        162 +
          (Math.floor(m.from / 4) +
            (Math.floor(m.to / 4) - Math.floor(m.from / 4)) * eased) *
            106,
      );
  } else
    for (let i = 0; i < 16; i++)
      if (board[i])
        add(
          board[i],
          48 + (i % 4) * 106,
          162 + Math.floor(i / 4) * 106,
          animation && t < 1
            ? animation.spawned.includes(i)
              ? Math.max(0.1, (t - 0.72) / 0.28)
              : animation.merged.includes(i)
                ? 1 + 0.09 * Math.sin(((t - 0.72) / 0.28) * Math.PI)
                : 1
            : 1,
        );
  return count;
}

/** One instanced draw call; moving tiles update tiny matrices, never a CanvasTexture. */
export function createArcadeTiles(screen: THREE.Mesh) {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 768;
  const context = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const offsets = new THREE.InstancedBufferAttribute(
    new Float32Array(16 * 2),
    2,
  );
  geometry.setAttribute("tileUv", offsets);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = "attribute vec2 tileUv;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\n vMapUv = vec2(vMapUv.x, 1.0-vMapUv.y) * vec2(191.0/1536.0, 191.0/768.0) + tileUv + vec2(0.5/1536.0, 0.5/768.0);",
    );
  };
  material.customProgramCacheKey = () => "arcade-tile-atlas-v1";
  const mesh = new THREE.InstancedMesh(geometry, material, 16);
  mesh.name = "2048 animated tiles";
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.raycast = () => {};
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  offsets.setUsage(THREE.DynamicDrawUsage);
  const position = screen.geometry.getAttribute("position"),
    uv = screen.geometry.getAttribute("uv");
  const corner = (u: number, v: number) => {
    let best = Infinity,
      index = 0;
    for (let i = 0; i < uv.count; i++) {
      const d = (uv.getX(i) - u) ** 2 + (uv.getY(i) - v) ** 2;
      if (d < best) {
        best = d;
        index = i;
      }
    }
    return new THREE.Vector3().fromBufferAttribute(position, index);
  };
  const topLeft = corner(0, 0),
    right = corner(1, 0).sub(topLeft),
    up = topLeft.clone().sub(corner(0, 1)),
    normal = right.clone().cross(up).normalize();
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeBasis(
    right.multiplyScalar(1 / 512),
    up.multiplyScalar(1 / 640),
    normal,
  );
  mesh.matrix.setPosition(topLeft.addScaledVector(normal, 0.002));
  mesh.matrixWorldNeedsUpdate = true;
  screen.add(mesh);
  const poses: ArcadeTilePose[] = [],
    dummy = new THREE.Object3D();
  let lastBoard: readonly number[] | null = null,
    lastAnimation: TileAnimation | null = null,
    wasVisible = false;
  let atlasUploads = 0,
    matrixUpdates = 0,
    atlasGpuUploads = 0,
    tileRenderCalls = 0;
  texture.onUpdate = () => {
    atlasGpuUploads++;
  };
  mesh.onBeforeRender = () => {
    tileRenderCalls++;
  };
  const redrawAtlas = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 30; i++) {
      context.save();
      context.translate((i % 8) * 192, Math.floor(i / 8) * 192);
      context.beginPath();
      context.rect(0, 0, 192, 192);
      context.clip();
      context.scale(192 / 98, 192 / 98);
      drawArcadeTileFace(context, 2 ** (i + 1));
      context.restore();
    }
    texture.needsUpdate = true;
    atlasUploads++;
  };
  redrawAtlas();
  return {
    mesh,
    redrawAtlas,
    update(
      state: ArcadeScreenState,
      animation: TileAnimation | null,
      now: number,
    ) {
      const visible = arcadeGpuTilesVisible(state),
        board = arcadeDisplayBoard(state);
      mesh.visible = visible;
      if (!visible) {
        wasVisible = false;
        return;
      }
      if (wasVisible && board === lastBoard && !animation && !lastAnimation)
        return;
      const count = writeArcadeTilePoses(board, animation, now, poses);
      mesh.count = count;
      for (let i = 0; i < count; i++) {
        const p = poses[i];
        dummy.position.set(p.x + 49, -p.y - 49, 0);
        dummy.scale.set(98 * p.scale, 98 * p.scale, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const slot = Math.log2(p.value) - 1;
        offsets.setXY(i, (slot % 8) / 8, Math.floor(slot / 8) / 4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      offsets.needsUpdate = true;
      matrixUpdates++;
      lastBoard = board;
      lastAnimation = animation;
      wasVisible = true;
    },
    metrics: () => ({
      atlasUploads,
      atlasGpuUploads,
      matrixUpdates,
      tileRenderCalls,
    }),
    dispose() {
      screen.remove(mesh);
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
