import { lazy, Suspense, useState } from "react";
import { NameOnboarding } from "./NameOnboarding";
import { readPlayerName } from "./player-name";
import { MobileExperience } from "./MobileExperience";

const Game = lazy(() => import("./Game"));

/** No world connection, cabin allocation or 3D downloads before a chosen name. */
export default function App() {
  const [name, setName] = useState(readPlayerName);
  if (!name)
    return (
      <MobileExperience>
        <NameOnboarding onEnter={setName} />
      </MobileExperience>
    );
  return (
    <MobileExperience>
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
    </MobileExperience>
  );
}
