/** Run: node --experimental-strip-types scripts/export-quickvolt.mjs */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Scene } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import {
  createScooterRig,
  SCOOTER_METRICS,
} from "../apps/web/src/scooter-geometry.ts";

// GLTFExporter needs the browser FileReader interface for its buffer Blob only.
globalThis.FileReader ??= class {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};
const rig = createScooterRig();
const scene = new Scene();
rig.group.userData = {
  units: "metres",
  forward: "+Z",
  ground: "Y=0",
  metrics: SCOOTER_METRICS,
  source:
    "Original geometry matching docs/art-direction/quickvolt9/game-reference-stylized.png",
};
scene.add(rig.group);
const target = resolve(
  "apps/web/public/assets/vehicles/QuickVolt9_Stylized.glb",
);
await mkdir(resolve("apps/web/public/assets/vehicles"), { recursive: true });
try {
  const binary = await new GLTFExporter().parseAsync(scene, {
    binary: true,
    onlyVisible: false,
  });
  if (!(binary instanceof ArrayBuffer))
    throw new Error("Expected binary GLB export");
  await writeFile(target, Buffer.from(binary));
  console.log(`Exported ${target} (${binary.byteLength} bytes)`);
} finally {
  rig.dispose();
}
