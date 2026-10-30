import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import * as THREE from "three";
import { getBoatState } from "./boat-state";
import {
  applyBoatLean,
  setBoatWheelAngle,
  BOAT_DIMENSIONS,
  RUNABOUT_IDS,
  type BoatSide,
} from "./boat-geometry";
import { cloneBoatRig } from "./boat-resources";
import {
  applyBoatEnvironment,
  boatEnvironmentIntensity,
  getBoatEnvironment,
} from "./boat-environment";
import { assetUrl } from "./assets";
import { lastLighting } from "./day-night";
import { LAKE_LEVEL } from "./swim-motion";

export type BoatHandle = {
  update(motion: { wheelAngle: number; lean: number }): void;
  gripWorldPosition(side: BoatSide, target: THREE.Vector3): THREE.Vector3;
  /** Unit normal of the wheel face, pointing back toward the driver. */
  wheelNormalWorld(target: THREE.Vector3): THREE.Vector3;
  /** Driver seat (cockpit floor under the driver) in boat-local space. */
  driverSeatLocal(target: THREE.Vector3): THREE.Vector3;
};

const towardDriver = new THREE.Vector3(0, 0, -1);
const seatWorld = new THREE.Vector3();

export const Boat = forwardRef<
  BoatHandle,
  { visible?: boolean; detail?: "full" | "lod" }
>(function Boat({ visible = true, detail = "full" }, ref) {
  const { scene } = useGLTF(assetUrl(RUNABOUT_IDS[detail]));
  const renderer = useThree((state) => state.gl);
  const rig = useMemo(() => cloneBoatRig(scene), [scene]);
  const materials = useMemo(() => {
    const found = new Set<THREE.MeshStandardMaterial>();
    rig.group.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = detail === "full";
      node.receiveShadow = true;
      for (const material of [node.material].flat())
        if (material instanceof THREE.MeshStandardMaterial) found.add(material);
    });
    return [...found];
  }, [rig, detail]);
  useLayoutEffect(
    () => applyBoatEnvironment(rig.group, getBoatEnvironment(renderer)),
    [rig, renderer],
  );
  useFrame(() => {
    const intensity = boatEnvironmentIntensity(lastLighting());
    for (const material of materials) material.envMapIntensity = intensity;
  });
  useImperativeHandle(
    ref,
    () => ({
      update({ wheelAngle, lean }) {
        setBoatWheelAngle(rig, wheelAngle);
        applyBoatLean(rig, lean);
      },
      gripWorldPosition(side, target) {
        rig.grips[side].updateWorldMatrix(true, false);
        return target.setFromMatrixPosition(rig.grips[side].matrixWorld);
      },
      wheelNormalWorld(target) {
        rig.wheel.updateWorldMatrix(true, false);
        return target
          .copy(towardDriver)
          .transformDirection(rig.wheel.matrixWorld);
      },
      driverSeatLocal(target) {
        rig.driverSeat.updateWorldMatrix(true, false);
        seatWorld.setFromMatrixPosition(rig.driverSeat.matrixWorld);
        return target.copy(rig.group.worldToLocal(seatWorld));
      },
    }),
    [rig],
  );
  // The cached GLB owns geometry and materials; React owns only the clone.
  return <primitive object={rig.group} visible={visible} dispose={null} />;
});

/** Keep the parked hull solid so the walking player cannot step through it. */
export function ParkedBoat({ mounted }: { mounted: boolean }) {
  const state = getBoatState();
  const [x, , z] = state.parked;
  const position: [number, number, number] = [x, LAKE_LEVEL, z];
  const { beam, bowExtent, sternExtent } = BOAT_DIMENSIONS;
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
            args={[beam / 2, 0.35, (bowExtent + sternExtent) / 2]}
            position={[0, 0.25, (bowExtent - sternExtent) / 2]}
            friction={1.4}
          />
        </RigidBody>
      )}
    </>
  );
}
