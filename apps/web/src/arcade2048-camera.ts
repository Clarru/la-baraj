import {
  ARCADE_STATION,
  arcadeStation,
  arcadeStationYaw,
} from "../../../packages/shared/arcade2048-station";
import { Vector3 } from "three";
/** Pull back along the current sight line, then let normal walking follow the player. */
export function arcadeExitCamera(
  position: Vector3,
  target: Vector3,
  player: Vector3,
) {
  const direction = position.clone().sub(target),
    distance = Math.max(4.8, direction.length());
  if (direction.lengthSq() < 1e-8) direction.set(0, 0.139, 0.99);
  direction.normalize();
  const nextTarget = player.clone().add(new Vector3(0, 0.65, 0));
  return {
    position: nextTarget.clone().addScaledVector(direction, distance),
    target: nextTarget,
  };
}

/** The screen and viewing offset use the same world facing as the cabinet and collider. */
export function arcadeFocusCamera(
  id: number,
  ground: number,
  aspect: number,
  fov = 50,
) {
  const station = arcadeStation(id) ?? ARCADE_STATION,
    yaw = arcadeStationYaw(id),
    forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const target = new Vector3(
    station.x,
    ground + 1.321,
    station.z,
  ).addScaledVector(forward, 0.181);
  const distance = Math.max(
    1.12,
    0.6 / (2 * Math.tan((fov * Math.PI) / 360) * aspect * 0.94),
  );
  return {
    target,
    position: target
      .clone()
      .addScaledVector(forward, Math.cos((Math.PI * 8) / 180) * distance)
      .add(new Vector3(0, Math.sin((Math.PI * 8) / 180) * distance, 0)),
  };
}
