import type { Blend, Sharp } from "sharp";
import sharp from "sharp";
import { applyColorBlend } from "@/lib/image-color-blend";
import { normalizeAdjustments } from "@/constants/adjustments";
import { getColorOverlays, type ColorOverlay } from "@/lib/color-overlays";
import {
  hasImageTransform,
  type ImageTransform,
} from "@/lib/image-transform";

export type AdjustedImageFormat = "jpeg" | "png" | "tiff";

export type { ImageTransform };

export interface RenderAdjustedImageOptions {
  /** Browser already rendered all effects; only transform, profile, and encode. */
  pixelsRendered?: boolean;
  adjustments?: Record<string, number>;
  format?: AdjustedImageFormat;
  quality?: number;
  /** Encoding speed only; PNG pixels remain lossless. */
  pngCompressionLevel?: number;
  maxWidth?: number;
  width?: number;
  height?: number;
  transform?: ImageTransform;
}

async function createSolidOverlayBuffer(
  width: number,
  height: number,
  ol: ColorOverlay,
): Promise<Buffer> {
  const w = Math.round(width);
  const h = Math.round(height);
  const { r, g, b } = ol.rgb;
  const alpha = Math.min(1, ol.opacity);
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r, g, b, alpha },
    },
  })
    .png()
    .toBuffer();
}

/** Radial vignette matching Canvas.tsx: transparent 35% → black at edges. */
async function createVignetteBuffer(
  width: number,
  height: number,
  vignette: number,
): Promise<Buffer | null> {
  const vignetteOpacity = Math.max(0, vignette / 100);
  if (vignetteOpacity <= 0) return null;

  const w = Math.round(width);
  const h = Math.round(height);
  const edgeAlpha = (vignetteOpacity * 0.9).toFixed(3);
  const svg = `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="vg" cx="50%" cy="50%" r="70%" fx="50%" fy="50%">
          <stop offset="35%" stop-color="rgb(0,0,0)" stop-opacity="0"/>
          <stop offset="100%" stop-color="rgb(0,0,0)" stop-opacity="${edgeAlpha}"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#vg)"/>
    </svg>
  `;

  return sharp(Buffer.from(svg), { density: 72 })
    .resize(w, h, { fit: "fill" })
    .png()
    .toBuffer();
}

/** Grain noise overlay approximating canvas feTurbulence + mix-blend-overlay. */
async function createGrainBuffer(
  width: number,
  height: number,
  grain: number,
): Promise<Buffer | null> {
  const grainOpacity = Math.max(0, grain / 100);
  if (grainOpacity <= 0) return null;

  const w = Math.round(width);
  const h = Math.round(height);
  const alpha = Math.round(grainOpacity * 0.6 * 255);
  const noise = Buffer.alloc(w * h);
  for (let i = 0; i < noise.length; i++) {
    // Coordinate-stable grain: preview and every export use identical samples.
    let sample = (i + 1) ^ 0x9e3779b9;
    sample = Math.imul(sample ^ (sample >>> 16), 0x21f0aaad);
    sample = Math.imul(sample ^ (sample >>> 15), 0x735a2d97);
    noise[i] = (sample ^ (sample >>> 15)) & 255;
  }

  const alphaChannel = Buffer.alloc(w * h, alpha);
  return sharp(noise, { raw: { width: w, height: h, channels: 1 } })
    .joinChannel(alphaChannel, { raw: { width: w, height: h, channels: 1 } })
    .resize(w, h, { fit: "fill" })
    .png()
    .toBuffer();
}

async function compositeColor(pipeline: Sharp, overlay: ColorOverlay): Promise<Sharp> {
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const source = [overlay.rgb.r, overlay.rgb.g, overlay.rgb.b];
  applyColorBlend(data, source, overlay.opacity);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

async function applyImageTransform(
  inputBuffer: Buffer,
  transform: ImageTransform,
): Promise<Buffer> {
  let pipeline = sharp(inputBuffer);
  if (transform.flipX) pipeline = pipeline.flop();
  if (transform.flipY) pipeline = pipeline.flip();

  const angle = transform.rotation + transform.straighten;
  if (angle !== 0) {
    pipeline = pipeline.rotate(angle, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  return pipeline.png().toBuffer();
}

/** Flatten lazy pipeline and return exact integer dimensions. */
async function flattenPipeline(
  pipeline: Sharp,
): Promise<{ pipeline: Sharp; width: number; height: number }> {
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const fresh = sharp(data, { raw: info });
  const { width, height } = info;
  return { pipeline: fresh, width, height };
}

async function compositeAndFlatten(
  pipeline: Sharp,
  overlayBuffer: Buffer,
  blend: Blend,
): Promise<Sharp> {
  const { pipeline: base, width, height } = await flattenPipeline(pipeline);
  let overlay = overlayBuffer;
  const overlayMeta = await sharp(overlayBuffer).metadata();
  if (
    Math.round(overlayMeta.width ?? 0) !== width ||
    Math.round(overlayMeta.height ?? 0) !== height
  ) {
    overlay = await sharp(overlayBuffer)
      .resize(width, height, { fit: "fill" })
      .png()
      .toBuffer();
  }

  const composed = await base
    .composite([{ input: overlay, blend }])
    .raw()
    .toBuffer({ resolveWithObject: true });
  return sharp(composed.data, { raw: composed.info });
}

/** Apply all canvas-parity adjustments and return an encoded image buffer. */
export async function renderAdjustedImage(
  inputBuffer: Buffer,
  options: RenderAdjustedImageOptions = {},
): Promise<Buffer> {
  if (options.pixelsRendered) return encodeRenderedImage(inputBuffer, options);
  const { adjustments = {} } = options;
  const normalized = normalizeAdjustments(adjustments);

  // Normalize EXIF and tagged wide-gamut/CMYK inputs before any pixel operations.
  const working = await sharp(inputBuffer).autoOrient().withIccProfile("srgb").ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  const workingImage = () => sharp(working.data, { raw: working.info });
  const originalAlpha = await workingImage().extractChannel("alpha").raw().toBuffer();

  const brightnessMultiplier = Math.max(
    0.05,
    1 +
      normalized.exposure / 100 +
      normalized.shadows / 300 +
      normalized.highlights / 300 +
      normalized.whites / 300 -
      normalized.blacks / 300,
  );

  const contrastWithClarity =
    normalized.contrast + normalized.clarity * 0.4;
  const contrastFactor = Math.max(0.05, 1 + contrastWithClarity / 100);

  const saturationMultiplier = Math.max(
    0,
    1 + (normalized.saturation + normalized.vibrance * 0.5) / 100,
  );

  let pipeline: Sharp = workingImage().modulate({
    brightness: brightnessMultiplier,
    saturation: saturationMultiplier,
  });

  if (contrastWithClarity !== 0) {
    const offset = -128 * (contrastFactor - 1);
    pipeline = pipeline.linear(contrastFactor, offset);
  }

  if (normalized.sharpen > 0) {
    const sigma = 0.5 + (normalized.sharpen / 100) * 3;
    pipeline = pipeline.sharpen({ sigma });
  }

  if (normalized.noiseReduction < 0) {
    const sigma = (Math.abs(normalized.noiseReduction) / 100) * 2;
    pipeline = pipeline.blur(Math.max(0.3, sigma));
  }

  const colorOverlays = getColorOverlays({
    temperature: normalized.temperature,
    tint: normalized.tint,
    hue: normalized.hue,
  });

  const overlayOrder: Array<ColorOverlay | null> = [
    colorOverlays.temperature,
    colorOverlays.tint,
    colorOverlays.hue,
  ];

  const flattened = await flattenPipeline(pipeline);
  const { width, height } = flattened;
  let work = flattened.pipeline;

  if (width > 0 && height > 0) {
    for (const ol of overlayOrder) {
      if (!ol) continue;
      if (ol.blendMode === "color") {
        work = await compositeColor(work, ol);
      } else {
        const overlayBuffer = await createSolidOverlayBuffer(width, height, ol);
        work = await compositeAndFlatten(work, overlayBuffer, "soft-light");
      }
    }

    const vignetteBuffer = await createVignetteBuffer(
      width,
      height,
      normalized.vignette,
    );
    if (vignetteBuffer) {
      work = await compositeAndFlatten(work, vignetteBuffer, "over");
    }

    const grainBuffer = await createGrainBuffer(
      width,
      height,
      normalized.grain,
    );
    if (grainBuffer) {
      work = await compositeAndFlatten(work, grainBuffer, "overlay");
    }
  }

  // Effects change RGB only. Full-frame overlays must never fill transparent pixels.
  const rgb = await work.removeAlpha().raw().toBuffer();
  const composed = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(originalAlpha, { raw: { width, height, channels: 1 } }).png({ compressionLevel: 0 }).toBuffer();
  return encodeRenderedImage(composed, options);
}

/** Encodes already rendered pixels without reapplying any slider effects. */
async function encodeRenderedImage(inputBuffer: Buffer, options: RenderAdjustedImageOptions): Promise<Buffer> {
  const { format = "jpeg", quality = 90, pngCompressionLevel = 9, maxWidth,
    width: outputWidth, height: outputHeight, transform } = options;
  let composed = inputBuffer;
  if (transform && hasImageTransform(transform)) composed = await applyImageTransform(composed, transform);
  let pipeline = sharp(composed).withIccProfile("srgb");

  if (outputWidth && outputHeight) {
    pipeline = pipeline.resize(outputWidth, outputHeight, { fit: "fill" });
  }

  if (!outputWidth && maxWidth && maxWidth > 0) {
    pipeline = pipeline.resize(maxWidth, null, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (format === "jpeg") {
    return pipeline
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: Math.min(100, Math.max(1, quality)), chromaSubsampling: "4:4:4" })
      .toBuffer();
  }

  if (format === "png") {
    return pipeline.png({ compressionLevel: pngCompressionLevel }).toBuffer();
  }

  return pipeline.tiff({ compression: "lzw" }).toBuffer();
}
