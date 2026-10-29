import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import type { Object3D } from "three";
import { createCruceCharacterRig } from "./cruce-character";
export function useCruceCharacter(object: Object3D) {
  const back = useTexture("/assets/cruce/back.svg");
  const rig = useMemo(
    () => createCruceCharacterRig(object, back),
    [object, back],
  );
  useFrame(() => rig.beginFrame(), -2);
  useEffect(() => () => rig.dispose(), [rig]);
  return rig;
}
