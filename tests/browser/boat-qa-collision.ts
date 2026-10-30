export * from "../../apps/web/src/boat-collision";
import { boatHullHit as actual } from "../../apps/web/src/boat-collision";
export const boatHullHit: typeof actual = (world, rapier, input) => {
  const contacts: unknown[] = [];
  for (let i = 0; i < input.exclude.numColliders(); i++)
    world.contactPairsWith(input.exclude.collider(i), (other) => {
      const parent = other.parent(),
        data = parent?.userData as Record<string, unknown> | undefined;
      contacts.push({
        shape: other.shape.type,
        bodyPosition: parent?.translation(),
        colliderPosition: other.translation(),
        colliderEnabled: other.isEnabled(),
        bodyEnabled: parent?.isEnabled(),
        remoteBoat: data?.remoteBoat ?? false,
        keys: data ? Object.keys(data) : [],
      });
    });
  if (contacts.length) {
    const out = document.querySelector("#boat-world-contacts"),
      old = JSON.parse(out?.getAttribute("data-contacts") ?? "[]");
    out?.setAttribute(
      "data-contacts",
      JSON.stringify(
        [
          ...old,
          {
            kind: "physical-contact",
            at: performance.now(),
            origin: [input.x, input.z],
            velocity: input.exclude.linvel(),
            contacts,
          },
        ].slice(-120),
      ),
    );
  }
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
            kind: "sweep-hit",
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
