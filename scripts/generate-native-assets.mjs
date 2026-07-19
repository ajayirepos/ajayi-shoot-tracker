import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const svg = readFileSync(path.join(root, "public/favicon.svg"));
const BG = "#0a0a0f";

mkdirSync(path.join(root, "resources"), { recursive: true });

// App icon: 1024x1024, flattened (no alpha — required for App Store icons)
const iconLogo = await sharp(svg, { density: 384 })
  .resize(730, 730, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();

await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } })
  .composite([{ input: iconLogo, gravity: "center" }])
  .flatten({ background: BG })
  .png()
  .toFile(path.join(root, "resources/icon.png"));

// Splash screen: 2732x2732, logo small and centered on solid background
const splashLogo = await sharp(svg, { density: 384 })
  .resize(600, 600, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();

for (const name of ["splash.png", "splash-dark.png"]) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: BG } })
    .composite([{ input: splashLogo, gravity: "center" }])
    .flatten({ background: BG })
    .png()
    .toFile(path.join(root, "resources", name));
}

console.log("wrote resources/icon.png, resources/splash.png, resources/splash-dark.png");
