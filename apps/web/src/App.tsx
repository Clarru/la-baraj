import { lazy, Suspense, useState } from "react";
import { NameOnboarding } from "./NameOnboarding";
import { readPlayerName } from "./player-name";
import { DesktopOnly } from "./DesktopOnly";
import { isMobileDevice } from "./device-access";

const Game = lazy(() => import("./Game"));

/** No world connection, cabin allocation or 3D downloads before a chosen name. */
export default function App() {
  const [name, setName] = useState(readPlayerName);
  const mobileTest =
    import.meta.env.VITE_MOBILE_GATE_LAB === "1" &&
    typeof location !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(location.hostname) &&
    new URLSearchParams(location.search).has("mobile-test");
  if (
    mobileTest ||
    (typeof navigator !== "undefined" && isMobileDevice(navigator))
  )
    return <DesktopOnly />;
  if (!name) return <NameOnboarding onEnter={setName} />;
  return (
    <Suspense
      fallback={
        <main className="name-welcome">
          <img
            className="name-welcome-logo"
            src="/assets/brand/la-baraj-banner.webp"
            alt="La Baraj"
            width={768}
            height={256}
          />
          <p role="status">Loading the lake…</p>
        </main>
      }
    >
      <Game initialName={name} />
    </Suspense>
  );
}
