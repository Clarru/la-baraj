import { useEffect, useMemo, useRef } from "react";
import * as T from "three";
import { useFrame, useLoader } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { createCruceCharacterRig } from "./cruce-character";
export function useCruceCharacter(object: T.Object3D) {
  const back = useTexture("/assets/cruce/back.svg"),
    source = useLoader(
      T.FileLoader,
      "/assets/animations/character-actions.json",
    );
  const grip = useMemo(
    () =>
      T.AnimationClip.parse(
        JSON.parse(String(source)).clips.find(
          (c: { name: string }) => c.name === "Activity_HoldRod",
        ),
      ),
    [source],
  );
  const current = useRef<ReturnType<typeof createCruceCharacterRig> | null>(
    null,
  );
  useEffect(() => {
    const rig = createCruceCharacterRig(object, back, grip);
    current.current = rig;
    return () => {
      rig.dispose();
      if (current.current === rig) current.current = null;
    };
  }, [object, back, grip]);
  useFrame(() => current.current?.beginFrame(), -2);
  return useMemo(
    () => ({
      update: (
        ...args: Parameters<
          ReturnType<typeof createCruceCharacterRig>["update"]
        >
      ) => current.current?.update(...args),
    }),
    [],
  );
}
