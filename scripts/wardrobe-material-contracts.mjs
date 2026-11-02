/** Source-pack hair masks are neutral; the fixed brunette preset must tint them. */
export function validateWardrobeMaterial(asset, name, factor) {
  if (asset !== "female-brunette-tailored") return;
  if (!/Female_Brunette|MI_Hair/.test(name)) return;
  if (factor.length !== 4 || factor.some(value => !Number.isFinite(value)) ||
      Math.max(...factor.slice(0, 3)) > .16)
    throw Error(asset + ": untinted brunette hair/brow material " + name);
}
