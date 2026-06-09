// Rasterizes the master icon (icons/icon-source.png) into
// public/icons/icon{16,48,128}.png using sharp.
// Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "icons", "icon-source.png");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const sizes = [16, 48, 128];
for (const size of sizes) {
  const out = join(outDir, `icon${size}.png`);
  await sharp(source).resize(size, size, { fit: "cover" }).png().toFile(out);
  console.log(`wrote ${out}`);
}
