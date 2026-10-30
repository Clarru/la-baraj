export * from "../../apps/web/src/boat-collision";
import { boatHullHit as actual } from "../../apps/web/src/boat-collision";
export const boatHullHit: typeof actual = (world, rapier, input) => {
  const hit = actual(world, rapier, input);
  if (hit) {
    const parent = hit.collider.parent(),
      data = parent?.userData as
        { remoteBoat?: boolean; terrain?: boolean } | undefined;
    const out = document.querySelector("#boat-world-contacts"),
      old = JSON.parse(out?.getAttribute("data-contacts") ?? "[]");
    out?.setAttribute(
      "data-contacts",
      JSON.stringify(
        [
          ...old,
          {
            at: performance.now(),
            origin: [input.x, input.z],
            point: hit.point,
            normal: hit.normal,
            shape: hit.collider.shape.type,
            bodyPosition: parent?.translation(),
            bodyEnabled: parent?.isEnabled(),
            remoteBoat: data?.remoteBoat ?? false,
            terrain: data?.terrain ?? false,
            keys: data ? Object.keys(data) : [],
          },
        ].slice(-60),
      ),
    );
  }
  return hit;
};
