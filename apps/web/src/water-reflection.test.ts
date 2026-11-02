import { afterEach, expect, it, vi } from "vitest";
import {
  Group,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  type WebGLRenderer,
} from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { throttleWaterReflection } from "./water-reflection";

afterEach(() => vi.restoreAllMocks());

it("keeps the water eye at the rendered camera between cached reflection passes", () => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const water = new Water(new PlaneGeometry(100, 100), {});
  water.rotation.x = -Math.PI / 2;
  water.updateMatrixWorld();
  const camera = new PerspectiveCamera(48, 16 / 9, 0.1, 6000);
  const parent = new Group();
  parent.position.set(3, 0, -10);
  parent.add(camera);
  camera.position.set(0, 4, -7);
  camera.lookAt(0, 0, 0);
  const render = vi.fn();
  const renderer = {
    getRenderTarget: () => null,
    setRenderTarget: vi.fn(),
    xr: { enabled: false },
    shadowMap: { autoUpdate: true },
    state: { buffers: { depth: { setMask: vi.fn() } } },
    autoClear: true,
    render,
  } as unknown as WebGLRenderer;
  const scene = new Scene();
  const expected = new Vector3();
  throttleWaterReflection(water);
  let cachedFrames = 0;
  for (let frame = 0; frame < 120; frame++) {
    now = frame * (1000 / 120);
    parent.position.z += 8 / 120;
    parent.rotation.y += 0.3 / 120;
    parent.updateMatrixWorld(true);
    const previousPasses = render.mock.calls.length;
    const previousProjection =
      water.material.uniforms.textureMatrix.value.clone();
    water.onBeforeRender(
      renderer,
      scene,
      camera,
      water.geometry,
      water.material,
      null!,
    );
    camera.getWorldPosition(expected);
    expect(water.material.uniforms.eye.value.distanceTo(expected)).toBeLessThan(
      1e-9,
    );
    if (render.mock.calls.length === previousPasses) {
      cachedFrames++;
      // The projection belongs to the cached image; do not reproject old pixels.
      expect(
        water.material.uniforms.textureMatrix.value.equals(previousProjection),
      ).toBe(true);
    }
  }
  expect(render.mock.calls.length).toBeGreaterThanOrEqual(17);
  expect(render.mock.calls.length).toBeLessThanOrEqual(20);
  expect(cachedFrames).toBeGreaterThanOrEqual(100);
});
