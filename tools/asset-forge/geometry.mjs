import { Matrix4, Ray, Vector3 } from "three";

// Decode node transforms, including glTF quantization, before measuring metres.
export function worldTriangles(document) {
  const triangles = [];
  for (const node of document.getRoot().listNodes()) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      if (primitive.getMode() !== 4) continue;
      const positions = primitive.getAttribute("POSITION");
      if (!positions) continue;
      const indices = primitive.getIndices()?.getArray();
      const matrix = new Matrix4().fromArray(node.getWorldMatrix());
      const vertices = [],
        value = [];
      for (let i = 0; i < positions.getCount(); i++) {
        positions.getElement(i, value);
        vertices.push(new Vector3(...value).applyMatrix4(matrix));
      }
      const count = indices?.length ?? vertices.length;
      for (let i = 0; i + 2 < count; i += 3) {
        const points = [0, 1, 2].map(
          (j) => vertices[indices ? indices[i + j] : i + j],
        );
        if (points.some((p) => !p || !p.toArray().every(Number.isFinite)))
          continue;
        triangles.push({
          points,
          node: node.getName(),
          material: primitive.getMaterial()?.getName() ?? "",
          triangle: i / 3,
        });
      }
    }
  }
  return triangles;
}

const cross2 = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const signedArea = (points) =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p[0] * q[1] - p[1] * q[0];
  }, 0) / 2;

function intersection(subject, clip) {
  let polygon = subject;
  const sign = signedArea(clip) >= 0 ? 1 : -1;
  for (let i = 0; i < clip.length && polygon.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length],
      output = [];
    for (let j = 0; j < polygon.length; j++) {
      const p = polygon[j],
        q = polygon[(j + 1) % polygon.length];
      const dp = sign * cross2(a, b, p),
        dq = sign * cross2(a, b, q);
      if (dp >= -1e-12) output.push(p);
      if (dp >= -1e-12 !== dq >= -1e-12) {
        const t = dp / (dp - dq);
        output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    polygon = output;
  }
  return polygon;
}

/** Conservative diagnosis of the demonstrated axis-aligned surface-overlap defect.
 * Adjacent edges, opposing contact faces and overlaps buried by other geometry
 * are excluded. This does not certify arbitrary topology or all camera angles.
 */
export function coplanarOverlaps(
  triangles,
  { planeTolerance = 0.00002, minimumArea = 0.000002 } = {},
) {
  const result = {
    scope: "axis-aligned, co-facing, exposed coplanar surfaces",
    planeToleranceMetres: planeTolerance,
    minimumAreaSquareMetres: minimumArea,
    complete: true,
    testedPairs: 0,
    findings: [],
  };
  if (triangles.length > 10000)
    return {
      ...result,
      complete: false,
      reason: "More than 10000 triangles; resource limits must pass first.",
    };
  const groups = new Map(),
    bounds = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const triangle of triangles) {
    for (const p of triangle.points)
      for (let a = 0; a < 3; a++) {
        bounds[a] = Math.min(bounds[a], p.getComponent(a));
        high[a] = Math.max(high[a], p.getComponent(a));
      }
    const [a, b, c] = triangle.points;
    const normal = new Vector3()
      .subVectors(b, a)
      .cross(new Vector3().subVectors(c, a));
    if (normal.lengthSq() < 1e-20) continue;
    normal.normalize();
    const axis = [0, 1, 2].reduce(
      (best, i) =>
        Math.abs(normal.getComponent(i)) > Math.abs(normal.getComponent(best))
          ? i
          : best,
      0,
    );
    if (Math.abs(normal.getComponent(axis)) < 1 - 1e-5) continue;
    const sign = Math.sign(normal.getComponent(axis));
    const axes = [0, 1, 2].filter((i) => i !== axis);
    const projected = triangle.points.map((p) =>
      axes.map((i) => p.getComponent(i)),
    );
    const plane =
      (a.getComponent(axis) + b.getComponent(axis) + c.getComponent(axis)) / 3;
    const bucket = Math.floor(plane / planeTolerance),
      key = `${axis}:${sign}`;
    const entry = {
      ...triangle,
      axis,
      sign,
      axes,
      projected,
      plane,
      bucket,
      area: Math.abs(signedArea(projected)),
    };
    if (!groups.has(key)) groups.set(key, new Map());
    const cells = groups.get(key);
    if (!cells.has(bucket)) cells.set(bucket, []);
    cells.get(bucket).push(entry);
  }
  const hit = new Vector3();
  for (const cells of groups.values())
    for (const [bucket, entries] of cells) {
      const candidates = [...entries, ...(cells.get(bucket + 1) ?? [])];
      for (let i = 0; i < entries.length; i++)
        for (let j = i + 1; j < candidates.length; j++) {
          const a = entries[i],
            b = candidates[j];
          if (Math.abs(a.plane - b.plane) > planeTolerance) continue;
          // Disjoint projected bounds cannot overlap, regardless of triangulation.
          if (
            [0, 1].some(
              (axis) =>
                Math.max(...a.projected.map((p) => p[axis])) <=
                  Math.min(...b.projected.map((p) => p[axis])) ||
                Math.max(...b.projected.map((p) => p[axis])) <=
                  Math.min(...a.projected.map((p) => p[axis])),
            )
          )
            continue;
          if (++result.testedPairs > 50000)
            return {
              ...result,
              complete: false,
              reason: "Pair-analysis limit reached.",
            };
          const polygon = intersection(a.projected, b.projected);
          if (polygon.length < 3) continue;
          const area = Math.abs(signedArea(polygon));
          if (area < minimumArea || area / Math.min(a.area, b.area) < 0.02)
            continue;
          const point = new Vector3();
          point.setComponent(a.axis, (a.plane + b.plane) / 2);
          for (let k = 0; k < 2; k++)
            point.setComponent(
              a.axes[k],
              polygon.reduce((sum, p) => sum + p[k], 0) / polygon.length,
            );
          const origin = point.clone();
          origin.setComponent(
            a.axis,
            a.sign > 0 ? high[a.axis] + 0.01 : bounds[a.axis] - 0.01,
          );
          const direction = new Vector3().setComponent(a.axis, -a.sign),
            ray = new Ray(origin, direction);
          let nearest = Infinity;
          for (const triangle of triangles)
            if (ray.intersectTriangle(...triangle.points, false, hit))
              nearest = Math.min(nearest, hit.distanceTo(origin));
          if (Math.abs(nearest - point.distanceTo(origin)) > planeTolerance * 2)
            continue;
          result.findings.push({
            point: point.toArray(),
            normal: new Vector3().setComponent(a.axis, a.sign).toArray(),
            overlapAreaSquareMetres: area,
            faces: [a, b].map((t) => ({
              node: t.node,
              material: t.material,
              triangle: t.triangle,
            })),
          });
          if (result.findings.length >= 100)
            return {
              ...result,
              complete: false,
              reason: "100 findings retained; additional overlaps may exist.",
            };
        }
    }
  return result;
}
