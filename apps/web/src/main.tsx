import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./multiplayer.css";
import "./scene-loading.css";
import "./style.css";
import "./game-art.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
