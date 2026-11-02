import type { Water } from "three/examples/jsm/objects/Water.js";

/** Cache the reflected world at 20 Hz, with a current view for every water draw. */
export function throttleWaterReflection(water: Water) {
  const reflect = water.onBeforeRender.bind(water);
  let reflectedAt = -Infinity;
  water.onBeforeRender = (...args) => {
    // Water normally updates eye inside its expensive mirror callback. Keeping
    // it stale makes Fresnel, highlights and ripple distortion jump as we move.
    water.material.uniforms.eye.value.setFromMatrixPosition(
      args[2].matrixWorld,
    );
    const now = performance.now();
    if (now - reflectedAt < 1000 / 20) return;
    reflectedAt = now;
    reflect(...args);
  };
}
