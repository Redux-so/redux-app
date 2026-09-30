/**
 * Convert brand mark (white on black) to transparent PNG + favicons.
 * Run: node scripts/process-brand-logo.mjs <source-image>
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicDir = join(root, "public");

const BG_THRESHOLD = 40;

async function loadRgba(source) {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function applyBlackToTransparent(data) {
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    if (r <= BG_THRESHOLD && g <= BG_THRESHOLD && b <= BG_THRESHOLD) {
      out[i + 3] = 0;
    }
  }
  return out;
}

function invertMarkToDark(data) {
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3];
    if (a === 0) continue;
    out[i] = 22;
    out[i + 1] = 22;
    out[i + 2] = 22;
  }
  return out;
}

async function rgbaToPngBuffer(rgba, width, height, size) {
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .resize(size, size)
    .png()
    .toBuffer();
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error("Usage: node scripts/process-brand-logo.mjs <source-image>");
    process.exit(1);
  }

  const { data, width, height } = await loadRgba(source);
  const transparent = applyBlackToTransparent(data);
  const darkMark = invertMarkToDark(transparent);

  const logo512 = await rgbaToPngBuffer(transparent, width, height, 512);
  const assetsBrandDir = join(root, "assets", "brand");
  mkdirSync(assetsBrandDir, { recursive: true });
  await sharp(logo512).toFile(join(publicDir, "logo.png"));
  await sharp(logo512).toFile(join(assetsBrandDir, "redux-mark.png"));

  const faviconWhite = await sharp(logo512).resize(32, 32).png().toBuffer();
  await sharp(faviconWhite).toFile(join(publicDir, "favicon-white.png"));

  const dark512 = await rgbaToPngBuffer(darkMark, width, height, 512);
  const faviconBlack = await sharp(dark512).resize(32, 32).png().toBuffer();
  await sharp(faviconBlack).toFile(join(publicDir, "favicon-black.png"));

  await sharp(logo512).resize(180, 180).png().toFile(join(publicDir, "apple-touch-icon.png"));

  console.log(
    "Wrote public/logo.png, assets/brand/redux-mark.png, favicon-white.png, favicon-black.png, apple-touch-icon.png",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
