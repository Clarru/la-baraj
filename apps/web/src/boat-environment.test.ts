import { expect, it } from "vitest";
import * as THREE from "three";
import {
  applyBoatEnvironment,
  boatEnvironmentIntensity,
} from "./boat-environment";
import { lightingAt } from "./day-night";
import { loadRunabout } from "./runabout-test-model";
import { extractBoatRig } from "./boat-geometry";

it("chrome does not glow at night", () => {
  const night = boatEnvironmentIntensity(lightingAt(1));
  const noon = boatEnvironmentIntensity(lightingAt(12));
  const dusk = boatEnvironmentIntensity(lightingAt(19.5));
  expect(night).toBeLessThanOrEqual(0.2);
  expect(night).toBeGreaterThanOrEqual(0.15);
  expect(noon).toBeGreaterThanOrEqual(0.9);
  expect(noon).toBeLessThanOrEqual(1);
  expect(dusk).toBeGreaterThan(night);
  expect(dusk).toBeLessThan(noon);
});

it("applies the map to every boat material", async () => {
  const rig = extractBoatRig(await loadRunabout("Lake_Runabout"));
  const envMap = new THREE.Texture();
  applyBoatEnvironment(rig.group, envMap);
  const materials = new Set<THREE.Material>();
  rig.group.traverse((node) => {
    if (node instanceof THREE.Mesh)
      for (const material of [node.material].flat()) materials.add(material);
  });
  const lit = [...materials].filter(
    (material) => material instanceof THREE.MeshStandardMaterial,
  );
  expect(lit.length).toBeGreaterThan(0);
  expect(lit.length).toBe(materials.size);
  for (const material of lit)
    expect((material as THREE.MeshStandardMaterial).envMap).toBe(envMap);
  const varnish = lit.find((material) => material.name === "Varnish");
  expect(varnish).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  expect((varnish as THREE.MeshPhysicalMaterial).clearcoat).toBeGreaterThan(0);
});
