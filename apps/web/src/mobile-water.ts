import { Color, DataTexture, LinearFilter, RGBAFormat } from "three";
const SIZE = 32;
let reflection: DataTexture | undefined;
const previousSky = new Color(-1, -1, -1),
  previousHorizon = new Color(-1, -1, -1),
  colour = new Color();
/** One page-lifetime sky gradient; no mirror camera or world render target. */
export function mobileWaterReflection(sky: Color, horizon: Color) {
  if (!reflection) {
    reflection = new DataTexture(
      new Uint8Array(SIZE * SIZE * 4),
      SIZE,
      SIZE,
      RGBAFormat,
    );
    reflection.minFilter = reflection.magFilter = LinearFilter;
    reflection.generateMipmaps = false;
  }
  if (!previousSky.equals(sky) || !previousHorizon.equals(horizon)) {
    const data = reflection.image.data as Uint8Array;
    for (let y = 0; y < SIZE; y++) {
      colour.copy(horizon).lerp(sky, y / (SIZE - 1));
      for (let x = 0; x < SIZE; x++) {
        const at = (y * SIZE + x) * 4;
        data[at] = Math.round(colour.r * 255);
        data[at + 1] = Math.round(colour.g * 255);
        data[at + 2] = Math.round(colour.b * 255);
        data[at + 3] = 255;
      }
    }
    previousSky.copy(sky);
    previousHorizon.copy(horizon);
    reflection.needsUpdate = true;
  }
  return reflection;
}
