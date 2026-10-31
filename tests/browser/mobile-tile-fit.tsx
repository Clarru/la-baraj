/** Layout-only authored values. No socket, persistence, or earned-state claim. */
import { createRoot } from "react-dom/client";
import { MobileArcade2048 } from "../../apps/web/src/MobileArcade2048";
import type { useArcade2048 } from "../../apps/web/src/use-arcade2048";
import "../../apps/web/src/mobile.css";
const board = [
  2, 16, 128, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144,
  1048576, 16777216, 536870912, 1073741824,
];
const controls = {
  state: {
    view: {
      game: { board, score: 0, moves: 0, revision: 1, continued: true },
      best: 0,
      leaders: [],
      ranked: false,
    },
    page: "board",
    active: true,
    pending: false,
    error: "",
    local: true,
    focused: false,
  },
  action() {},
  move() {},
  setFocused() {},
  direction: { current: null },
  hardware: { current: { kind: "", at: 0 } },
} as ReturnType<typeof useArcade2048>;
createRoot(document.getElementById("root")!).render(
  <MobileArcade2048 controls={controls} onExit={() => {}} />,
);
