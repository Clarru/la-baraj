/** Source card silhouette. All 24 faces share this portrait crop and rounded stock. */
export const CRUCE_CARD_FRAME = {
  width: 363,
  height: 585,
  radius: 26,
} as const;
export const CRUCE_CARD_WIDTH = 0.085;
export const CRUCE_CARD_HEIGHT =
  (CRUCE_CARD_WIDTH * CRUCE_CARD_FRAME.height) / CRUCE_CARD_FRAME.width;
export const CRUCE_CARD_RADIUS =
  (CRUCE_CARD_WIDTH * CRUCE_CARD_FRAME.radius) / CRUCE_CARD_FRAME.width;
