import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, CuboidCollider, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { getVehicleState } from "./vehicle-state";
import {
  advanceScooterMotion,
  createScooterRig,
  type ScooterMotion,
} from "./scooter-geometry";

export { SCOOTER_METRICS, scooterGripPosition } from "./scooter-geometry";
export type ScooterHandle = {
  update(motion: ScooterMotion): void;
  readonly steeringAngle: number;
};

export const Scooter = forwardRef<
  ScooterHandle,
  { parked?: boolean; visible?: boolean }
>(function Scooter({ parked = false, visible = true }, ref) {
  const rig = useMemo(createScooterRig, []);
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

export function ParkedScooter() {
  const group = useRef<THREE.Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const rotation = useMemo(() => new THREE.Quaternion(), []);
  useFrame(() => {
    if (!group.current) return;
    const state = getVehicleState();
    group.current.visible = !state.mounted;
    group.current.position.set(...state.parked);
    group.current.rotation.y = state.yaw;
    if (body.current) {
      body.current.setEnabled(!state.mounted);
      if (!state.mounted) {
        const [x,y,z] = state.parked;
        body.current.setTranslation({x,y,z}, true);
        body.current.setNextKinematicTranslation({x,y,z});
        rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, state.yaw);
        body.current.setRotation(rotation, true);
        body.current.setNextKinematicRotation(rotation);
      }
    }
  });
  return (
    <>
      <group ref={group}><Scooter parked /></group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0,-1000,0]}>
        <CuboidCollider args={[.2,.09,.62]} position={[0,.18,0]} friction={1.4} />
        <CuboidCollider args={[.18,.5,.09]} position={[0,.65,.46]} friction={1.4} />
      </RigidBody>
    </>
  );
}
