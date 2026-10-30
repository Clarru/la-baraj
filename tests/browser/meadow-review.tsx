import React from "react";
import { createRoot } from "react-dom/client";
import Game from "../../apps/web/src/Game";
import "../../apps/web/src/multiplayer.css";
import "../../apps/web/src/scene-loading.css";
import "../../apps/web/src/style.css";
import "../../apps/web/src/game-art.css";
createRoot(document.querySelector("#root")!).render(
  <>
    <Game initialName="Meadow review" />
    <output id="meadow-review-metrics" hidden />
  </>,
);
