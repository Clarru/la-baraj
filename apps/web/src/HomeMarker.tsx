import { useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { GameIcon } from "./GameArt";
import { cabinSpots, terrainHeight } from "./geography";
import { cabinDesignForPlot } from "./cabin-designs";
import { playerPosition } from "./player";
export function HomeMarker({
  index,
  visible,
}: {
  index: number;
  visible: boolean;
}) {
  const home = cabinSpots[index],
    design = cabinDesignForPlot(index),
    label = useRef<HTMLDivElement>(null);
  const base = terrainHeight(home.x, home.z);
  useFrame(() => {
    if (!label.current) return;
    const distance = Math.hypot(
      playerPosition.x - home.x,
      playerPosition.z - home.z,
    );
    label.current.style.opacity = String(
      visible ? Math.max(0, Math.min(1, (220 - distance) / 100)) : 0,
    );
    label.current.style.visibility =
      visible && distance < 220 ? "visible" : "hidden";
  });
  return (
    <group>
      <Html
        center
        position={[home.x, base + design.height + 0.8, home.z]}
        zIndexRange={[30, 0]}
      >
        <div
          ref={label}
          className="home-world-marker"
          data-testid="home-world-marker"
        >
          <GameIcon name="cabin" size={29} />
          <div>
            <strong>Your cabin</strong>
            <span>{String(index + 1).padStart(2, "0")} · Home</span>
          </div>
        </div>
      </Html>
      <pointLight
        position={[home.x, base + 2, home.z - 3.3]}
        color="#ffcc91"
        intensity={2.2}
        distance={6}
        decay={2}
      />
    </group>
  );
}
