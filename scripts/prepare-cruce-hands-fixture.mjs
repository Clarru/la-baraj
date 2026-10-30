import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
const out = ".impeccable/review/cruce-hands";
await fs.mkdir(out, { recursive: true });
const result = await build({
  entryPoints: ["tests/browser/cruce-hands-fixture.tsx"],
  plugins: [
    {
      name: "raw-assets",
      setup(b) {
        b.onResolve({ filter: /\?raw$/ }, (a) => ({
          path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, "")),
          namespace: "raw",
        }));
        b.onLoad({ filter: /.*/, namespace: "raw" }, async (a) => ({
          contents: await fs.readFile(a.path, "utf8"),
          loader: "text",
        }));
      },
    },
  ],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" },
  loader: { ".woff2": "dataurl" },
  external: ["/assets/*"],
});
const js = result.outputFiles.find((f) => !f.path.endsWith(".css")).text;
await fs.writeFile(
  out + "/fixture.html",
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cruce hands QA</title><style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}aside{position:fixed;left:12px;top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:90%;background:#f6f2e8;color:#243831;padding:10px;font:16px sans-serif}button,select{font:inherit;padding:8px}</style></head><body><div id="app"></div><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`,
);
console.log(out + "/fixture.html");
