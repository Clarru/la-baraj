/** Builds a self-contained file:// fixture, never another game server. */
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const out = resolve(".impeccable/review/cruce");
await mkdir(out, { recursive: true });
const result = await build({
  entryPoints: ["tests/browser/cruce-fixture.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  outdir: out,
  define: {
    "process.env.NODE_ENV": '"production"',
    "import.meta.env.VITE_GAME_DIAGNOSTICS": '"0"',
  },
  external: ["/assets/*"],
  loader: { ".woff2": "dataurl" },
});
const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
let css = result.outputFiles.find((f) => f.path.endsWith(".css")).text;
for (const suit of ["heart", "bell", "leaf", "acorn"])
  for (const rank of ["unter", "ober", "king", "nine", "ten", "ace"]) {
    const id = `${suit}-${rank}`;
    const bytes = await readFile(`apps/web/public/assets/cruce/${id}.webp`);
    css += `.cruce-card[style*="${id}.webp"]{background-image:url(data:image/webp;base64,${bytes.toString("base64")})!important}`;
  }
const back = await readFile("apps/web/public/assets/cruce/back.svg", "utf8");
css += `.cruce-card--back{background-image:url(data:image/svg+xml;base64,${Buffer.from(back).toString("base64")})!important}`;
for (const [font, name, weight] of [
  ["Alegreya Sans", "alegreya-sans", 400],
  ["Alegreya Sans", "alegreya-sans", 700],
  ["Bree Serif", "bree-serif", 400],
]) {
  for (const subset of ["latin", "latin-ext"]) {
    const bytes = await readFile(
      `apps/web/public/fonts/${name}-${subset}-${weight}-normal.woff2`,
    );
    css += `@font-face{font-family:'${font}';font-weight:${weight};src:url(data:font/woff2;base64,${bytes.toString("base64")});unicode-range:${subset === "latin-ext" ? "U+0100-02FF,U+1E00-1EFF" : "U+0000-00FF,U+2000-206F"}}`;
  }
}
for (const image of ["felt", "table-surround"]) {
  const bytes = await readFile(`apps/web/public/assets/cruce/${image}.webp`);
  css = css.replaceAll(
    `/assets/cruce/${image}.webp`,
    `data:image/webp;base64,${bytes.toString("base64")}`,
  );
}
await writeFile(
  resolve(out, "fixture.html"),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cruce UI fixture</title><style>:root{--font-body:"Alegreya Sans",sans-serif;--font-heading:"Bree Serif",serif}body{margin:0;background:#364b3b}*{box-sizing:border-box}.fixture-tools{position:fixed;top:0;left:0;z-index:100;display:flex;flex-wrap:wrap;gap:5px;max-width:100%;font:12px sans-serif;background:#fff;padding:4px}${css}</style></head><body><div id="root"></div><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`,
);
console.log(resolve(out, "fixture.html"));
