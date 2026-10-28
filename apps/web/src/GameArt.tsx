/** ImageGen pictograms from the same material reference as the La Baraj sign.
 * Atlas viewports account for the actual painted bounds, rather than assuming
 * perfectly regular cells. SVG only clips the raster; no replacement line art.
 */
const pictograms = {
  menu: [24, 60, 300, 310],
  cabin: [328, 79, 293, 281],
  map: [635, 92, 296, 265],
  controls: [938, 142, 292, 199],
  return: [47, 398, 259, 223],
  close: [357, 389, 245, 241],
  back: [639, 408, 276, 187],
  expand: [957, 383, 250, 243],
  collapse: [45, 653, 240, 245],
  people: [345, 667, 273, 227],
  offline: [638, 664, 287, 224],
  walk: [975, 630, 231, 292],
  fish: [20, 962, 310, 205],
  fire: [337, 905, 272, 295],
  door: [662, 913, 237, 280],
  bench: [925, 953, 297, 223],
} as const;

export type GameIconName = keyof typeof pictograms;

export function GameIcon({
  name,
  size = 28,
  x,
  y,
}: {
  name: GameIconName;
  size?: number;
  x?: number;
  y?: number;
}) {
  return (
    <svg
      className="game-art-icon"
      width={size}
      height={size}
      x={x}
      y={y}
      viewBox={pictograms[name].join(" ")}
      aria-hidden="true"
      focusable="false"
      overflow="hidden"
    >
      <image href="/assets/ui/pictograms.webp" width={1254} height={1254} />
    </svg>
  );
}
