import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpFromLine, Expand, Smartphone } from "lucide-react";
import { useTouchDevice } from "./mobile-device";
import {
  blockMobileGame,
  enterGameFullscreen,
  immersiveDisplay,
  installGame,
  useInstallAvailable,
} from "./mobile-display";

export function InstallInstructions() {
  const available = useInstallAvailable();
  const [message, setMessage] = useState("");
  const apple =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return (
    <div className="mobile-install">
      <h3>
        <Smartphone size={20} /> Add La Baraj to your Home Screen
      </h3>
      {available ? (
        <button
          onClick={async () =>
            setMessage(
              (await installGame())
                ? "After installation, open La Baraj from your Home Screen."
                : "Installation closed. You can also use your browser’s menu to install.",
            )
          }
        >
          <ArrowUpFromLine size={20} /> Install La Baraj
        </button>
      ) : (
        <p>
          {apple
            ? "In Safari, open Share, choose Add to Home Screen, keep Open as Web App enabled if shown, then tap Add. Open La Baraj from its new icon."
            : "Open your browser’s menu and choose Install app or Add to Home Screen. Then launch La Baraj from its new icon. If unavailable, open this link in Chrome or Safari."}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <p className="mobile-note">
        Your lake, Cruce and 2048 need an internet connection.
      </p>
    </div>
  );
}
export function MobileExperience({ children }: { children: ReactNode }) {
  const touch = useTouchDevice();
  const [started, setStarted] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const update = () => setImmersive(immersiveDisplay());
    update();
    const queries = [
      matchMedia("(display-mode: standalone)"),
      matchMedia("(display-mode: fullscreen)"),
    ];
    document.addEventListener("fullscreenchange", update);
    queries.forEach((q) => q.addEventListener("change", update));
    return () => {
      document.removeEventListener("fullscreenchange", update);
      queries.forEach((q) => q.removeEventListener("change", update));
    };
  }, []);
  const gate = touch && (!started || (!immersive && !fallback));
  useEffect(() => {
    blockMobileGame(gate);
    return () => blockMobileGame(false);
  }, [gate]);
  if (!touch) return children;
  return (
    <>
      {started && (
        <div className="mobile-game-content" inert={gate}>
          {children}
        </div>
      )}
      {gate && (
        <main className="mobile-setup">
          <img
            src="/assets/brand/la-baraj-banner.webp"
            width={768}
            height={256}
            alt="La Baraj"
          />
          <section aria-labelledby="mobile-title">
            <h1 id="mobile-title">The lake, in your pocket.</h1>
            <p>
              Play in fullscreen for room to move. Turn your phone sideways for
              a wider view, or stay in portrait.
            </p>
            <button
              className="mobile-start"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const entered = await enterGameFullscreen();
                setPending(false);
                if (entered) {
                  setImmersive(true);
                  setStarted(true);
                } else setFailed(true);
              }}
            >
              <Expand size={23} />{" "}
              {immersive ? "Enter La Baraj" : "Play in fullscreen"}
            </button>
            {(failed ||
              (typeof document !== "undefined" &&
                !document.documentElement.requestFullscreen)) && (
              <>
                <p role="status">
                  This browser cannot open fullscreen here. Add the game to your
                  Home Screen for an app view, or play in the browser.
                </p>
                <button
                  onClick={() => {
                    setFallback(true);
                    setStarted(true);
                  }}
                >
                  Play in this browser
                </button>
              </>
            )}
            <InstallInstructions />
            <p className="mobile-note">
              Left thumb to move. Drag the world to look around. Nearby objects
              show buttons you can tap.
            </p>
          </section>
        </main>
      )}
    </>
  );
}
export function MobileDisplayOptions() {
  const touch = useTouchDevice();
  const [message, setMessage] = useState("");
  if (!touch) return null;
  return (
    <div className="mobile-display-options">
      <button
        onClick={async () =>
          setMessage(
            (await enterGameFullscreen())
              ? "Fullscreen is on."
              : "Use the Home Screen app for an app view on this browser.",
          )
        }
      >
        <Expand size={20} /> Fullscreen
      </button>
      {message && <p role="status">{message}</p>}
      <InstallInstructions />
    </div>
  );
}
