import { useEffect, useRef } from "react";
import type * as THREE from "three";
import {
  appearanceKey,
  type Appearance,
} from "../../../packages/shared/appearance";
import { AvatarWardrobe, type WardrobeLoader } from "./avatar-wardrobe";

export type WardrobeLoadState = { loading: boolean; error: string | null };
/** Separate effects keep the controller stable during selection and recreate it
 * correctly through React's development StrictMode cleanup/remount cycle.
 */
export function useAvatarWardrobe(
  object: THREE.Object3D,
  appearance: Appearance,
  onState?: (state: WardrobeLoadState) => void,
  load?: WardrobeLoader,
  retryVersion = 0,
) {
  const controller = useRef<AvatarWardrobe | null>(null);
  const callback = useRef(onState);
  callback.current = onState;
  const key = appearanceKey(appearance);
  useEffect(() => {
    const owned = new AvatarWardrobe(object, load);
    controller.current = owned;
    return () => {
      if (controller.current === owned) controller.current = null;
      owned.dispose();
    };
  }, [object, load]);
  useEffect(() => {
    let current = true;
    callback.current?.({ loading: true, error: null });
    void controller.current
      ?.update(appearance)
      .then((applied) => {
        if (current && applied)
          callback.current?.({ loading: false, error: null });
      })
      .catch(() => {
        if (current)
          callback.current?.({
            loading: false,
            error: "This outfit could not be loaded. Try again.",
          });
      });
    return () => {
      current = false;
    };
  }, [object, key, load, retryVersion]);
}
