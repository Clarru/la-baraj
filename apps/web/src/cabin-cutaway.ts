import * as THREE from "three";

/** Retain the actual prefab's deck, steps and low foundation when its roof lifts. */
export function cabinCutawayBase(source: THREE.Object3D) {
  return filterPrefabTriangles(source, (points) =>
    points.every((p) => p.y <= 0.76),
  );
}

/** Sims-style foreground wall treatment: the open door must not hide the player. */
export function roomCutawayFront(source: THREE.Object3D, frontZ: number) {
  return filterPrefabTriangles(source, (points) => {
    const center = points
      .reduce((sum, p) => sum.add(p), new THREE.Vector3())
      .multiplyScalar(1 / 3);
    return center.y < 0.15 || center.z < frontZ - 0.13;
  });
}

function filterPrefabTriangles(
  source: THREE.Object3D,
  keep: (points: THREE.Vector3[]) => boolean,
) {
  const base = source.clone(true);
  base.updateMatrixWorld(true);
  base.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry as THREE.BufferGeometry;
    const positions = geometry.getAttribute("position"),
      indices: number[] = [];
    const result = new THREE.BufferGeometry();
    for (const key of Object.keys(geometry.attributes))
      result.setAttribute(key, geometry.attributes[key]);
    const count = geometry.index?.count ?? positions.count;
    let lastMaterial = -1,
      groupStart = 0;
    const vertex = new THREE.Vector3();
    for (let i = 0; i < count; i += 3) {
      const triangle = [0, 1, 2].map(
        (j) => geometry.index?.getX(i + j) ?? i + j,
      );
      const points = triangle.map((j) =>
        vertex
          .fromBufferAttribute(positions, j)
          .applyMatrix4(node.matrixWorld)
          .clone(),
      );
      if (!keep(points)) continue;
      const material =
        geometry.groups.find((g) => i >= g.start && i < g.start + g.count)
          ?.materialIndex ?? 0;
      if (material !== lastMaterial) {
        if (lastMaterial !== -1)
          result.addGroup(
            groupStart,
            indices.length - groupStart,
            lastMaterial,
          );
        groupStart = indices.length;
        lastMaterial = material;
      }
      indices.push(...triangle);
    }
    if (lastMaterial !== -1)
      result.addGroup(groupStart, indices.length - groupStart, lastMaterial);
    result.setIndex(indices);
    result.computeBoundingSphere();
    node.geometry = result;
    node.visible = indices.length > 0;
  });
  return base;
}
