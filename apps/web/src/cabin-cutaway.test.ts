import { it, expect } from "vitest";
import * as THREE from "three";
import { cabinCutawayBase } from "./cabin-cutaway";
const { loadRig } = await import(
  /* @vite-ignore */ new URL(
    "../../../scripts/extract-activity-clips.mjs",
    import.meta.url,
  ).href
);
it("retains original low deck geometry while removing the six cabin roofs", async () => {
  for (const name of [
    "Gable",
    "AFrame",
    "Sage",
    "GableBlue",
    "AFrameCopper",
    "SagePergola",
  ]) {
    const { scene } = await loadRig(
      new URL(
        `../public/assets/optimized/Lake_Cabin_${name}.glb`,
        import.meta.url,
      ).pathname,
    );
    const cutaway = cabinCutawayBase(scene);
    cutaway.updateMatrixWorld(true);
    let vertices = 0;
    const point = new THREE.Vector3();
    cutaway.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.visible) return;
      const indices = o.geometry.index!,
        positions = o.geometry.getAttribute("position");
      vertices += indices.count;
      for (let i = 0; i < indices.count; i++) {
        point
          .fromBufferAttribute(positions, indices.getX(i))
          .applyMatrix4(o.matrixWorld);
        expect(point.y).toBeLessThanOrEqual(0.7601);
      }
    });
    expect(vertices).toBeGreaterThan(100);
    expect(new THREE.Box3().setFromObject(scene).max.y).toBeGreaterThan(4);
  }
});
