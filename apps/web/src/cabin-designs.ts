/** Whole architectural designs are selected as a unit; dimensions stay in artist metres. */
export type PorchFootprint = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};
export type CabinDesign = {
  key: string;
  label: string;
  /** Underlying fixture family; do not infer it from a plot index. */
  family: 0 | 1 | 2;
  width: number;
  depth: number;
  numberMount: [number, number, number];
  height: number;
  porches: PorchFootprint[];
  stairX: number;
  stairZ: number;
};
const fullPorch = { minX: -2.85, maxX: 2.85, minZ: 3.05, maxZ: 4.85 };
const sagePorch = { minX: 0.25, maxX: 3.05, minZ: 3.05, maxZ: 4.55 };
export const cabinDesigns: CabinDesign[] = [
  {
    key: "Gable",
    label: "Timber veranda",
    family: 0,
    width: 5.69,
    depth: 6.19,
    numberMount: [2.715, 2.0, 4.92],
    height: 5.825,
    porches: [fullPorch],
    stairX: 0,
    stairZ: 5.18,
  },
  {
    key: "AFrame",
    label: "Forest A-frame",
    family: 1,
    width: 6.09,
    depth: 6.39,
    numberMount: [-1.95, 1.65, 3.192],
    height: 6.84,
    porches: [fullPorch],
    stairX: 0,
    stairZ: 5.08,
  },
  {
    key: "Sage",
    label: "Sage porch",
    family: 2,
    width: 6.69,
    depth: 5.89,
    numberMount: [3.03, 1.95, 4.605],
    height: 5.375,
    porches: [sagePorch],
    stairX: 1.65,
    stairZ: 4.86,
  },
  {
    key: "GableBlue",
    label: "Blue wraparound",
    family: 0,
    width: 5.69,
    depth: 6.19,
    numberMount: [2.715, 2.0, 4.92],
    height: 5.825,
    porches: [fullPorch, { minX: 2.8, maxX: 4.65, minZ: -2.6, maxZ: 4.8 }],
    stairX: 0,
    stairZ: 5.18,
  },
  {
    key: "AFrameCopper",
    label: "Copper shelter",
    family: 1,
    width: 6.09,
    depth: 6.39,
    numberMount: [1.9, 1.85, 4.86],
    height: 6.84,
    porches: [fullPorch],
    stairX: 0,
    stairZ: 5.08,
  },
  {
    key: "SagePergola",
    label: "Ivory pergola",
    family: 2,
    width: 6.69,
    depth: 5.89,
    numberMount: [3.03, 1.95, 4.605],
    height: 5.375,
    porches: [sagePorch, { minX: 3.2, maxX: 5.3, minZ: -1.6, maxZ: 4.6 }],
    stairX: 1.65,
    stairZ: 4.86,
  },
];
function shuffledDesigns() {
  // Five of each silhouette, shuffled once with a fixed world seed. Refreshing cannot reroll a home.
  const choices = Array.from({ length: 30 }, (_, i) => i % cabinDesigns.length);
  let seed = 0xc1ac15;
  for (let i = choices.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((seed / 4294967296) * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}
const assignments = shuffledDesigns();
export function cabinDesignForPlot(index: number): CabinDesign {
  return cabinDesigns[assignments[((index % 30) + 30) % 30]];
}
export function cabinYaw(index: number) {
  let seed = (Math.imul(8100 + index * 137, 1664525) + 1013904223) >>> 0;
  return Math.PI + (seed / 4294967296 - 0.5) * 0.04;
}
