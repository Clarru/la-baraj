import { installMobileDisplay } from "./mobile-display";
import { installClientDiagnostics } from "./client-diagnostics";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./multiplayer.css";
import "./scene-loading.css";
import "./style.css";
import "./game-art.css";
import "./mobile.css";
installClientDiagnostics();
installMobileDisplay();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
