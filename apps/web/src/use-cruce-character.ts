import { useEffect, useMemo } from "react";
import type { Object3D, AnimationClip } from "three";
import { useFrame } from "@react-three/fiber";
import {
  createCruceCharacterController,
  cruceBackTexture,
} from "./cruce-character";
/** grip is from the existing immutable characterClips cache; no per-avatar JSON parsing. */
export function useCruceCharacter(object: Object3D, grip?: AnimationClip) {
  const controller = useMemo(
    () => createCruceCharacterController(object, cruceBackTexture, grip),
    [object, grip],
  );
  useFrame(() => controller.beginFrame(), -2);
  useEffect(() => () => controller.dispose(), [controller]);
  return controller;
}
