// Rasterizes icons/icon.svg into public/icons/icon{16,48,128}.png using sharp.
// Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = join(root, "icons", "icon.svg");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const sizes = [16, 48, 128];
for (const size of sizes) {
  const out = join(outDir, `icon${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log(`wrote ${out}`);
}
