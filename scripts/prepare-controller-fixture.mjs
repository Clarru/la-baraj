import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
fs.mkdirSync(".impeccable/review/controller", { recursive: true });
const result = await build({
  entryPoints: ["tests/browser/controller-fixture.tsx"],
  plugins: [
    {
      name: "raw-assets",
      setup(b) {
        b.onResolve({ filter: /\?raw$/ }, (a) => ({
          path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, "")),
          namespace: "raw",
        }));
        b.onLoad({ filter: /.*/, namespace: "raw" }, (a) => ({
          contents: fs.readFileSync(a.path, "utf8"),
          loader: "text",
        }));
      },
    },
  ],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  define: {
    "import.meta.env": JSON.stringify({
      DEV: false,
      PROD: true,
      VITE_GAME_DIAGNOSTICS: "1",
    }),
  },
});
const js = result.outputFiles[0].text;
fs.writeFileSync(
  ".impeccable/review/controller/fixture.html",
  `<!doctype html><html><head><title>La Baraj controller QA</title><style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}aside{position:fixed;left:10px;top:10px;background:#f5f1e5;padding:12px;max-width:360px;font:14px system-ui;color:#233a33}#motion{position:fixed;bottom:10px;left:10px;max-height:160px;overflow:auto;white-space:pre;background:#f5f1e5;padding:8px;font:10px monospace;max-width:460px}</style></head><body><div id="app"></div><output id="motion"></output><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`,
);
