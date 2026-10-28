import { useState } from "react";
import { GameIcon } from "./GameArt";
import {
  lake,
  roads,
  cabinSpots,
  fishingSpots,
  sharedGrounds,
} from "./geography";
import { cabinDesignForPlot } from "./cabin-designs";
import {
  mapHomePosition,
  playerMapRotation,
  type NavigationSample,
} from "./home";
const shoreline = lake.map((p) => p.join(",")).join(" ");
const mapRoads = roads
  .filter(
    (r) =>
      !["steps", "path", "track", "footway", "cycleway", "bridleway"].includes(
        r.kind,
      ),
  )
  .map((r) => r.points.map((p) => p.join(",")).join(" "));
export function Minimap({
  navigation,
  homeIndex,
  active,
  onFocusHome,
  onClose,
}: {
  navigation: NavigationSample;
  homeIndex: number;
  active: boolean;
  onFocusHome: () => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!active) return null;
  const home = cabinSpots[homeIndex],
    size = expanded ? 420 : 204;
  const xs = cabinSpots.map((p) => p.x).concat(navigation.x),
    zs = cabinSpots.map((p) => p.z).concat(navigation.z);
  const range = expanded
    ? Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...zs) - Math.min(...zs),
      ) + 160
    : 220;
  const center = expanded
    ? {
        x: (Math.max(...xs) + Math.min(...xs)) / 2,
        z: (Math.max(...zs) + Math.min(...zs)) / 2,
      }
    : { x: navigation.x, z: navigation.z };
  const scale = range / size,
    icon = 18 * scale;
  const marker = mapHomePosition(home, center, range),
    distance = Math.round(
      Math.hypot(home.x - navigation.x, home.z - navigation.z),
    );
  return (
    <aside
      className={`lake-minimap ${expanded ? "expanded" : ""}`}
      aria-label="Lake minimap"
      data-testid="minimap"
      data-player={JSON.stringify(navigation)}
      data-home={homeIndex + 1}
    >
      <header>
        <strong>{expanded ? "South shore" : "Lake Cinciș"}</strong>
        <div className="map-header-actions">
          <button
            className="map-expand"
            aria-label={expanded ? "Collapse map" : "Expand map"}
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse map" : "Expand map"}
          >
            <GameIcon name={expanded ? "collapse" : "expand"} size={21} />
          </button>
          <button
            className="map-expand"
            onClick={onClose}
            aria-label="Close map"
            title="Close map (M)"
          >
            <GameIcon name="close" size={18} />
          </button>
        </div>
      </header>
      <svg
        role="img"
        aria-label={`You are ${distance} metres from your home, cabin ${homeIndex + 1}`}
        viewBox={`${center.x - range / 2} ${center.z - range / 2} ${range} ${range}`}
        width={size}
        height={size}
      >
        <rect
          x={center.x - range / 2}
          y={center.z - range / 2}
          width={range}
          height={range}
          fill="#b5bfa9"
        />
        <polygon
          points={shoreline}
          fill="#739ba2"
          stroke="#d9e1cf"
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        />
        {mapRoads.map((points, i) => (
          <polyline
            key={i}
            points={points}
            fill="none"
            stroke="#e6dcc4"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {cabinSpots.map((p) => (
          <g key={p.i}>
            <rect
              x={p.x - 2.4 * scale}
              y={p.z - 2.4 * scale}
              width={4.8 * scale}
              height={4.8 * scale}
              fill={p.i === homeIndex ? "#875733" : "#536452"}
              stroke="#e4e7dd"
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
            />
            <title>{`Cabin ${p.i + 1} · ${cabinDesignForPlot(p.i).label}`}</title>
          </g>
        ))}
        {fishingSpots.map((p, i) => (
          <g key={i} transform={`translate(${p.x} ${p.z})`}>
            <GameIcon name="fish" x={-icon / 2} y={-icon / 2} size={icon} />
            <title>Fishing</title>
          </g>
        ))}
        <GameIcon
          name="fire"
          x={sharedGrounds[1].x - icon / 2}
          y={sharedGrounds[1].z - icon / 2}
          size={icon}
        />
        <g
          transform={`translate(${marker.x} ${marker.z})`}
          data-testid="home-map-marker"
        >
          <circle
            r={8.5 * scale}
            fill="#f0e6cf"
            stroke="#845531"
            strokeWidth={1.1}
            vectorEffect="non-scaling-stroke"
          />
          <GameIcon name="cabin" x={-icon / 2} y={-icon / 2} size={icon} />
          <title>{`Your home · Cabin ${homeIndex + 1}${marker.offscreen ? " · beyond this map edge" : ""}`}</title>
        </g>
        <g
          transform={`translate(${navigation.x} ${navigation.z}) rotate(${playerMapRotation(navigation.heading)}) scale(${scale})`}
          data-testid="player-map-marker"
        >
          <path
            d="M0 -8 L5.5 5 L0 2.5 L-5.5 5 Z"
            fill="#233642"
            stroke="#ffffff"
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </g>
      </svg>
      <span className="map-north">N</span>
      <footer>
        <button
          className="map-home-button"
          onClick={onFocusHome}
          aria-label="Look at your cabin"
          title="H to look at home"
        >
          <GameIcon name="cabin" size={24} />
          <span>
            Your cabin <strong>{String(homeIndex + 1).padStart(2, "0")}</strong>
          </span>
        </button>
        <span>{distance} m</span>
      </footer>
      <a
        className="map-attribution"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        © OpenStreetMap contributors
      </a>
      {expanded && (
        <p className="map-legend">
          <span>Arrow · You</span>
          <span>House · Home</span>
          <span>Fish · Fishing</span>
          <span>Flame · Campfire</span>
        </p>
      )}
    </aside>
  );
}
