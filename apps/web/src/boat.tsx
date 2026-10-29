import { forwardRef, useEffect, useImperativeHandle, useMemo } from "react";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import type { Vector3 } from "three";
import { getBoatState } from "./boat-state";
import {
  applyBoatLean,
  setBoatWheelAngle,
  BOAT_FLOAT_HEIGHT,
  BOAT_METRICS,
  type BoatSide,
} from "./boat-geometry";
import { cloneBoatRig } from "./boat-resources";

export { BOAT_METRICS, boatGripPosition } from "./boat-geometry";
export type BoatHandle = {
  update(motion: { wheelAngle: number; lean: number }): void;
  gripWorldPosition(side: BoatSide, target: Vector3): Vector3;
};

export const Boat = forwardRef<BoatHandle, { visible?: boolean }>(function Boat(
  { visible = true },
  ref,
) {
  const rig = useMemo(cloneBoatRig, []);
  useImperativeHandle(
    ref,
    () => ({
      update({ wheelAngle, lean }) {
        setBoatWheelAngle(rig, wheelAngle);
        applyBoatLean(rig, lean);
      },
      gripWorldPosition(side, target) {
        rig.wheelSpin.updateWorldMatrix(true, false);
        return target
          .fromArray(BOAT_METRICS.grips[side])
          .applyMatrix4(rig.wheelSpin.matrixWorld);
      },
    }),
    [rig],
  );
  useEffect(() => () => rig.dispose(), [rig]);
  return <primitive object={rig.group} visible={visible} dispose={null} />;
});

/** Keep the parked hull solid so the walking player cannot step through it. */
export function ParkedBoat({ mounted }: { mounted: boolean }) {
  const state = getBoatState();
  const [x, y, z] = state.parked;
  const position: [number, number, number] = [x, y + BOAT_FLOAT_HEIGHT, z];
  return (
    <>
      <group
        visible={!mounted}
        position={position}
        rotation={[0, state.yaw, 0]}
      >
        <Boat />
      </group>
      {!mounted && (
        <RigidBody
          type="fixed"
          colliders={false}
          position={position}
          rotation={[0, state.yaw, 0]}
        >
          <CuboidCollider
            args={[0.7, 0.3, 1.8]}
            position={[0, 0.25, 0]}
            friction={1.4}
          />
        </RigidBody>
      )}
    </>
  );
}
