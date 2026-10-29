import { useEffect, useState } from "react";
import { formatGameTime, formatClockMinutes, worldNow } from "./day-night";

function displayTime() {
  const override =
    import.meta.env.VITE_GAME_DIAGNOSTICS === "1"
      ? new URLSearchParams(location.search).get("time")
      : null;
  return override !== null && Number.isFinite(Number(override))
    ? formatClockMinutes(Number(override) * 60)
    : formatGameTime(worldNow());
}
/** ImageGen glyphs are decorative; the actual time remains available as text. */
export function GameClock() {
  const [time, setTime] = useState(displayTime);
  useEffect(() => {
    const timer = setInterval(() => setTime(displayTime()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <time
      className="game-clock"
      aria-label={`In-game time ${time}`}
      title={`In-game time ${time}`}
    >
      <span className="game-clock-glyphs" aria-hidden="true">
        {[...time].map((char, i) =>
          char === ":" ? (
            <span className="game-clock-colon" key={i}>
              :
            </span>
          ) : (
            <span
              className="game-clock-digit"
              key={i}
              style={{ backgroundPosition: `${(Number(char) / 9) * 100}% 50%` }}
            />
          ),
        )}
      </span>
    </time>
  );
}
