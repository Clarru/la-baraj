import type { FoundationPlan } from "./cabin-grounding";

/** Render as a world-space sibling of the cabin, outside its translated group. */
export function GroundSupports({
  plan,
  width = 0.24,
  color = "#655e53",
}: {
  plan: FoundationPlan;
  width?: number;
  color?: string;
}) {
  if (!plan.ok || !Number.isFinite(width) || width <= 0) return null;
  return (
    <group>
      {plan.supports.map((support, index) =>
        support.length > 0 ? (
          <mesh
            key={index}
            position={[support.x, support.centerY, support.z]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[width, support.length, width]} />
            <meshStandardMaterial color={color} roughness={0.98} />
          </mesh>
        ) : null,
      )}
    </group>
  );
}
