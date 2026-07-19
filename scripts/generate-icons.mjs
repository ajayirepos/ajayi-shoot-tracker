import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const svg = readFileSync(path.join(root, "public/favicon.svg"));
const BG = "#0a0a0f";

const targets = [
  { file: "public/apple-touch-icon.png", size: 180, pad: 0.72 },
  { file: "public/icons/icon-192.png", size: 192, pad: 0.72 },
  { file: "public/icons/icon-512.png", size: 512, pad: 0.72 },
  { file: "public/icons/maskable-512.png", size: 512, pad: 0.55 },
];

for (const { file, size, pad } of targets) {
  const inner = Math.round(size * pad);
  const logo = await sharp(svg, { density: 384 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(root, file));

  console.log(`wrote ${file} (${size}x${size})`);
}
