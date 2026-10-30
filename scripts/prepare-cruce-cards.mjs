/** Mechanical export of individually generated masters; never redraws card artwork. */
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const folder = "docs/art-direction/cruce";
const ranks = ["unter", "ober", "king", "nine", "ten", "ace"];
const labels = [
  "DOIAR · 2",
  "TREIAR · 3",
  "PĂTRAR · 4",
  "NOUAR · 0",
  "ZECAR · 10",
  "AS · 11",
];
const manifest = [];
for (const suit of ["heart", "bell", "leaf", "acorn"]) {
  const prompts = JSON.parse(
    await readFile(`${folder}/${suit}-prompts.json`, "utf8"),
  );
  const tiles = [];
  for (const [i, rank] of ranks.entries()) {
    const id = `${suit}-${rank}`;
    const source = `${folder}/generated/${id}.png`;
    const output = `apps/web/public/assets/cruce/${id}.webp`;
    await sharp(source)
      .resize(363, 585, { fit: "fill" })
      .webp({ quality: 88 })
      .toFile(output);
    const bytes = await readFile(output);
    manifest.push({
      id,
      file: `${id}.webp`,
      width: 363,
      height: 585,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      prompt: `docs/art-direction/cruce/${suit}-prompts.json`,
      reference: prompts.find((p) => p.id === id).reference,
    });
    tiles.push({
      input: await sharp(source)
        .resize(181, 293, { fit: "fill" })
        .png()
        .toBuffer(),
      left: 18 + i * 195,
      top: 18,
    });
  }
  const text = `<svg width="1193" height="36" xmlns="http://www.w3.org/2000/svg">${labels.map((label, i) => `<text x="${108.5 + i * 195}" y="24" text-anchor="middle" fill="#243831" font-family="Arial,sans-serif" font-weight="bold" font-size="13">${label}</text>`).join("")}</svg>`;
  tiles.push({ input: Buffer.from(text), left: 0, top: 316 });
  await sharp({
    create: { width: 1193, height: 358, channels: 4, background: "#eeeade" },
  })
    .composite(tiles)
    .png()
    .toFile(`${folder}/${suit}-six-card-grid.png`);
}
await writeFile(
  `${folder}/manifest.json`,
  JSON.stringify(
    { generatedWith: "image_gen (built-in)", cards: manifest },
    null,
    2,
  ) + "\n",
);
console.log(
  `Prepared ${manifest.length} WebPs (${Math.round(manifest.reduce((n, m) => n + m.bytes, 0) / 1024)} KiB) and four review grids.`,
);
