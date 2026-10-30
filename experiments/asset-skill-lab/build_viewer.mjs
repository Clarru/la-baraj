import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const directory = path.dirname(fileURLToPath(import.meta.url));
const data = {};
for (const id of ["lantern", "crate"]) {
  const name = id === "lantern" ? "Lantern" : "Crate";
  data[id] = {
    reference: JSON.parse(
      await fs.readFile(
        path.join(directory, id, "reference/metrics.json"),
        "utf8",
      ),
    ),
    candidate: JSON.parse(
      await fs.readFile(
        path.join(directory, id, "final/qa/metrics.json"),
        "utf8",
      ),
    ),
    glbs: await Promise.all(
      [
        path.join(directory, "references", `${id}-original.glb`),
        path.join(directory, id, "final", `Lab_${name}.glb`),
      ].map(async (file) => (await fs.readFile(file)).toString("base64")),
    ),
  };
}
const result = await build({
  entryPoints: [path.join(directory, "viewer.js")],
  bundle: true,
  write: false,
  format: "iife",
  minify: true,
  define: { __MODEL_DATA__: JSON.stringify(data) },
  legalComments: "inline",
});
const license = await fs.readFile(
  path.join(directory, "../../node_modules/three/LICENSE"),
  "utf8",
);
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>La Baraj — 3D asset comparison</title>
<style>*{box-sizing:border-box}body{margin:0;background:#eef0f2;color:#222;font:15px system-ui}header{padding:16px 24px;display:flex;align-items:center;gap:12px}h1{font-size:18px;margin:0 14px 0 0}button{padding:8px 16px;border:1px solid #bbb;border-radius:6px;background:white;cursor:pointer}button[aria-pressed=true]{background:#203c33;color:white}#status{font-size:12px;margin-left:auto}.labels{display:flex;text-align:center;border-top:1px solid #bbb;padding:10px}.labels strong{width:50%}canvas{display:block;width:100vw;height:calc(100vh - 150px)}footer{padding:10px 24px;font-size:12px}p{margin:0}</style>
<header><h1>La Baraj · Asset QA</h1><button data-asset="lantern">Lantern</button><button data-asset="crate">Crate</button><span id="status">Starting…</span></header>
<div class="labels"><strong>QUATERNIUS REFERENCE</strong><strong>AUTHORED RECONSTRUCTION</strong></div><canvas aria-label="Side-by-side interactive 3D comparison"></canvas>
<footer>Drag to rotate · Scroll to zoom · Same camera and lighting · Local embedded assets, no multiplayer connection · Technical budgets pass; visual differences remain. Renderer: project Three.js version.</footer>
<!-- Three.js license: ${license.replaceAll("--", "—")} -->
<script>${result.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script></html>`;
await fs.writeFile(path.join(directory, "asset-comparison.html"), html);
console.log(
  `Wrote standalone viewer (${Buffer.byteLength(html)} bytes). No server required.`,
);
