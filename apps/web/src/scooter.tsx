import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { getVehicleState } from "./vehicle-state";
import {
  advanceScooterMotion,
  type ScooterMotion,
} from "./scooter-geometry";
import { cloneScooterRig } from "./scooter-resources";

export { SCOOTER_METRICS, scooterGripPosition } from "./scooter-geometry";
export type ScooterHandle = {
  update(motion: ScooterMotion): void;
  readonly steeringAngle: number;
};

export const Scooter = forwardRef<
  ScooterHandle,
  { parked?: boolean; visible?: boolean }
>(function Scooter({ parked = false, visible = true }, ref) {
  const rig = useMemo(cloneScooterRig, []);
  const motion = useRef({ wheelAngle: 0, steeringAngle: 0 });
  rig.kickstand.visible = parked;
  useImperativeHandle(
    ref,
    () => ({
      get steeringAngle() {
        return motion.current.steeringAngle;
      },
      update(sample) {
        advanceScooterMotion(motion.current, sample);
        rig.frontWheel.rotation.x = motion.current.wheelAngle;
        rig.rearWheel.rotation.x = motion.current.wheelAngle;
        rig.steering.rotation.y = motion.current.steeringAngle;
      },
    }),
    [rig],
  );
  useEffect(() => () => rig.dispose(), [rig]);
  return <primitive object={rig.group} visible={visible} dispose={null} />;
});

/** Keep the parked solid out of the rider's capsule while mounted. */
export function ParkedScooter({ mounted }: { mounted: boolean }) {
  const state = getVehicleState();
  return (
    <>
      <group
        visible={!mounted}
        position={state.parked}
        rotation={[0, state.yaw, 0]}
      >
        <Scooter parked />
      </group>
      {!mounted && (
        <RigidBody
          type="fixed"
          colliders={false}
          position={state.parked}
          rotation={[0, state.yaw, 0]}
        >
          <CuboidCollider
            args={[0.2, 0.09, 0.62]}
            position={[0, 0.18, 0]}
            friction={1.4}
          />
          <CuboidCollider
            args={[0.18, 0.5, 0.09]}
            position={[0, 0.65, 0.46]}
            friction={1.4}
          />
        </RigidBody>
      )}
    </>
  );
}
