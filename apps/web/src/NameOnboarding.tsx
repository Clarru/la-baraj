import { useState } from "react";
import { GameIcon } from "./GameArt";
import { savePlayerName, validPlayerName } from "./player-name";

export function NameOnboarding({
  onEnter,
}: {
  onEnter: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  return (
    <main className="name-welcome">
      <h1>
        <img
          className="name-welcome-logo"
          src="/assets/brand/la-baraj-banner.webp"
          alt="La Baraj"
          width={768}
          height={256}
        />
      </h1>
      <img
        className="name-welcome-lake"
        src="/assets/ui/lake-vignette.webp"
        width={960}
        height={640}
        alt=""
      />
      <section className="name-welcome-card" aria-labelledby="welcome-title">
        <h2 id="welcome-title">What should we call you?</h2>
        <p>Pick the name your friends will see at the lake.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try {
              onEnter(savePlayerName(name));
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Please check your name.",
              );
            }
          }}
        >
          <label htmlFor="welcome-name">Your name</label>
          <input
            id="welcome-name"
            name="nickname"
            autoComplete="nickname"
            autoFocus
            required
            maxLength={24}
            placeholder="e.g. Claudiu"
            value={name}
            aria-invalid={!!error}
            aria-describedby={
              error ? "welcome-name-error" : "welcome-name-note"
            }
            onChange={(event) => {
              setName(event.target.value);
              setError(
                /[\p{C}<>]/u.test(event.target.value)
                  ? "Use a name without angle brackets or control characters."
                  : "",
              );
            }}
          />
          {error && (
            <p id="welcome-name-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="name-welcome-enter"
            type="submit"
            disabled={!validPlayerName(name)}
          >
            <GameIcon name="walk" size={25} />
            Enter La Baraj
          </button>
        </form>
        <p id="welcome-name-note" className="name-welcome-note">
          You can change this later in Menu.
        </p>
      </section>
    </main>
  );
}
