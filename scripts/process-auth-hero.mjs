/**
 * Compress the auth shell hero photo (desktop right panel).
 *
 * Usage:
 *   node scripts/process-auth-hero.mjs <source.jpg>
 *
 * Writes:
 *   assets/brand/auth-hero.jpg
 */
import sharp from "sharp";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const assetsBrandDir = join(root, "assets", "brand");

/** Balanced size vs. quality for full-bleed 50vw panel (see ReduxClerkAuthShell). */
const JPEG_QUALITY = 80;

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error("Usage: node scripts/process-auth-hero.mjs <source.jpg>");
    process.exit(1);
  }

  mkdirSync(assetsBrandDir, { recursive: true });
  const dest = join(assetsBrandDir, "auth-hero.jpg");

  await sharp(source)
    .rotate()
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, chromaSubsampling: "4:2:0" })
    .toFile(dest);

  const { size } = statSync(dest);
  console.log(`Wrote ${dest} (${size} bytes, quality ${JPEG_QUALITY})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
