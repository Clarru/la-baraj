import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameIcon } from "./GameArt";
import { GameClock } from "./GameClock";
import { formatGameTime } from "./day-night";
import {
  weatherDescription,
  type LakeWeather,
} from "../../../packages/shared/weather";

import type { MultiplayerRoom } from "./multiplayer";
import { MultiplayerHud } from "./multiplayer-hud";

export function GameHeader({
  room,
  menuOpen,
  onMenu,
}: {
  room: MultiplayerRoom;
  menuOpen: boolean;
  onMenu: () => void;
}) {
  return (
    <header className="play-header">
      <h1 className="play-logo">
        <img
          src="/assets/brand/la-baraj-banner.webp"
          alt="La Baraj"
          width={768}
          height={256}
        />
      </h1>
      <div className="play-actions">
        <GameClock />
        <MultiplayerHud room={room} />
        <button
          className="game-menu-toggle"
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={onMenu}
        >
          <GameIcon name="menu" size={27} />
          <span>Menu</span>
        </button>
      </div>
    </header>
  );
}

export function GameDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="game-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="game-dialog-heading">
        <h2>{title}</h2>
        <button
          className="game-close"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
        >
          <GameIcon name="close" size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function GameMenu({
  nickname,
  homeIndex,
  homeOwnerName,
  weather,
  canLookHome = true,
  onRename,
  onControls,
  onHome,
  onReset,
  onWave,
  canWave = true,
  onClose,
}: {
  nickname: string;
  homeIndex: number | null;
  homeOwnerName?: string | null;
  weather?: LakeWeather | null;
  canLookHome?: boolean;
  onRename: (name: string) => void;
  onControls: () => void;
  onHome: () => void;
  onReset: () => void;
  onWave?: () => void;
  canWave?: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(nickname);
  return (
    <GameDialog title="Menu" onClose={onClose}>
      <form
        className="game-name-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onRename(name);
        }}
      >
        <label htmlFor="game-nickname">Your name</label>
        <div>
          <input
            id="game-nickname"
            name="nickname"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            autoComplete="nickname"
          />
          <button
            type="submit"
            disabled={!name.trim() || name.trim() === nickname}
          >
            Save
          </button>
        </div>
      </form>
      <p className="game-home-info" data-testid="assigned-home">
        <GameIcon name="cabin" size={42} />
        <span>
          {homeIndex === null
            ? "Finding your cabin…"
            : `Your cabin · ${String(homeIndex + 1)}`}
        </span>
      </p>
      {homeIndex !== null && homeOwnerName !== nickname && (
        <p className="game-name-sign-note">
          Your cabin sign updates after your name stays unchanged for 5 minutes.
        </p>
      )}
      <div className="game-menu-actions">
        {onWave && (
          <button
            onClick={onWave}
            disabled={!canWave}
            title={
              canWave ? "Wave hello" : "Stand still outside an activity to wave"
            }
          >
            <GameIcon name="people" size={29} />
            <span>Wave hello</span>
            <kbd>G</kbd>
          </button>
        )}
        <button onClick={onControls}>
          <GameIcon name="controls" size={29} />
          <span>Controls</span>
          <kbd>?</kbd>
        </button>
        <button
          onClick={onHome}
          disabled={homeIndex === null || !canLookHome}
          title={
            canLookHome ? "Look at your cabin" : "Available outside a cabin"
          }
        >
          <GameIcon name="cabin" size={29} />
          <span>Look at your cabin</span>
          <kbd>H</kbd>
        </button>
      </div>
      <div className="game-menu-rescue">
        <button onClick={onReset} disabled={homeIndex === null}>
          <GameIcon name="return" size={23} />
          <span>Return to your cabin</span> <kbd>R</kbd>
        </button>
        <p>If you’re stuck, return outside your cabin.</p>
      </div>
      <p className="game-weather-info">
        Lake weather · {weather ? weatherDescription(weather) : "Unavailable"}
      </p>
      <p className="game-weather-credit">
        {weather ? `As of ${formatGameTime(weather.observedAt)} · ` : ""}Weather
        data:{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{" "}
        ·{" "}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY 4.0
        </a>
      </p>
      <a
        className="game-attribution"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        © OpenStreetMap contributors
      </a>
    </GameDialog>
  );
}
const controlRows = [
  ["W A S D / arrows", "Move"],
  ["Shift", "Run"],
  ["Space", "Jump"],
  ["C / Z", "Toggle crouch / lie prone"],
  ["G", "Wave hello while standing still"],
  ["Enter / Esc", "Chat above your character / close chat"],
  ["P / middle click", "Punch a nearby player while standing"],
  ["Left or right drag / scroll", "Look around / zoom"],
  ["E", "Enter a door, fish, or use the campfire nearby"],
  ["F", "Sit or stand beside a bench"],
  ["A / D while seated", "Shift to the next seat"],
  ["V", "Ride a nearby scooter or park"],
  ["H", "Outside: look at your cabin; move to resume walking"],
  ["R", "Return outside your cabin"],
  ["? / Escape", "Open controls / close this panel"],
];
export function ControlsHelp({
  onClose,
  onMenu,
}: {
  onClose: () => void;
  onMenu: () => void;
}) {
  return (
    <GameDialog title="Controls" onClose={onClose}>
      <p className="game-help-intro">
        Follow the prompts beside doors, benches, and the water.
      </p>
      <dl className="game-control-list">
        {controlRows.map(([keys, action]) => (
          <div key={keys}>
            <dt>{keys}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <p className="game-help-note">
        Chat appears as you type. Enter adds a line. Click outside to walk while
        it lingers for five seconds, or press Escape to close.
      </p>
      <p className="game-help-note">
        On the scooter: W to accelerate, S to brake then reverse, A/D to steer,
        Shift to boost.
      </p>
      <button className="game-back" onClick={onMenu}>
        <GameIcon name="back" size={23} />
        Back to menu
      </button>
    </GameDialog>
  );
}
