import { Shape, ShapeGeometry } from "three";
import {
  CRUCE_CARD_WIDTH,
  CRUCE_CARD_HEIGHT,
  CRUCE_CARD_RADIUS,
} from "../../../packages/shared/cruce-card-frame";
/** Same circular outline/UV frame as the UI crop; opaque source corners never reach the mesh. */
export function createCruceCardGeometry() {
  const x = CRUCE_CARD_WIDTH / 2,
    y = CRUCE_CARD_HEIGHT / 2,
    r = CRUCE_CARD_RADIUS;
  const shape = new Shape();
  shape.moveTo(-x + r, -y);
  shape.lineTo(x - r, -y);
  shape.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x, y - r);
  shape.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-x + r, y);
  shape.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-x, -y + r);
  shape.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
  shape.closePath();
  const geometry = new ShapeGeometry(shape, 8),
    p = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < p.count; i++)
    uv.setXY(i, (p.getX(i) + x) / (2 * x), (p.getY(i) + y) / (2 * y));
  return geometry;
}
