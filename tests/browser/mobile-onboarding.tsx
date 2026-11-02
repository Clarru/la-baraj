/** Local-only real onboarding/layout fixture. Never mounts a world or room. */
import { createRoot } from "react-dom/client";
import { MobileExperience } from "../../apps/web/src/MobileExperience";
import { installMobileDisplay } from "../../apps/web/src/mobile-display";
import { NameOnboarding } from "../../apps/web/src/NameOnboarding";
import "../../apps/web/src/style.css";
import "../../apps/web/src/game-art.css";
import "../../apps/web/src/mobile.css";

if (!["localhost", "127.0.0.1"].includes(location.hostname))
  throw Error("Mobile onboarding QA is localhost only");
installMobileDisplay();
createRoot(document.getElementById("root")!).render(
  <MobileExperience>
    <NameOnboarding onEnter={() => {}} />
  </MobileExperience>,
);
