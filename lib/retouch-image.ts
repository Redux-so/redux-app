import sharp from "sharp";

export class RetouchMaskError extends Error {}

export interface RetouchImage {
  pixels: Buffer;
  mask: Buffer;
  width: number;
  height: number;
  selection: { left: number; top: number; width: number; height: number };
}

/** Decode the same oriented source shown in the browser; never stretch a mismatched mask. */
export async function prepareRetouchImage(source: Buffer, maskBase64: string): Promise<RetouchImage> {
  const { data: pixels, info } = await sharp(source).rotate().toColourspace("srgb").ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  let mask: Buffer;
  try {
    const decoded = await sharp(Buffer.from(maskBase64, "base64"))
      .flatten({ background: "black" }).removeAlpha().greyscale().raw()
      .toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== info.width || decoded.info.height !== info.height || decoded.info.channels !== 1) {
      throw new Error("Mask dimensions do not match");
    }
    mask = decoded.data;
  } catch {
    throw new RetouchMaskError("The selection no longer matches the image. Paint the area again.");
  }
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (mask[y * info.width + x] === 0) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new RetouchMaskError("Paint over the area to edit first.");
  return { pixels, mask, width: info.width, height: info.height,
    selection: { left, top, width: right - left + 1, height: bottom - top + 1 } };
}

/** Keep every channel outside the mask byte-for-byte; retouch never changes source alpha. */
export async function compositeRetouch(image: RetouchImage, replacement: Buffer,
  region = { left: 0, top: 0, width: image.width, height: image.height }): Promise<Buffer> {
  const { data: edited, info } = await sharp(replacement).toColourspace("srgb").ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== region.width || info.height !== region.height) throw new Error("Retouch result dimensions do not match");
  const result = Buffer.from(image.pixels);
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const index = (y + region.top) * image.width + x + region.left;
      const amount = image.mask[index] / 255;
      if (amount === 0 || image.pixels[index * 4 + 3] === 0) continue;
      for (let channel = 0; channel < 3; channel++) {
        result[index * 4 + channel] = Math.round(image.pixels[index * 4 + channel] * (1 - amount)
          + edited[(y * region.width + x) * 4 + channel] * amount);
      }
    }
  }
  return sharp(result, { raw: { width: image.width, height: image.height, channels: 4 } }).png().toBuffer();
}

/** A local crop avoids reducing the entire photo to the provider's input size. */
export async function prepareInpaintCrop(image: RetouchImage) {
  const selected = image.selection;
  const padding = Math.max(64, Math.ceil(Math.max(selected.width, selected.height) / 2));
  const left = Math.max(0, selected.left - padding), top = Math.max(0, selected.top - padding);
  const region = { left, top,
    width: Math.min(image.width, selected.left + selected.width + padding) - left,
    height: Math.min(image.height, selected.top + selected.height + padding) - top };
  const scale = Math.min(1, 1024 / Math.max(region.width, region.height));
  const width = Math.max(1, Math.round(region.width * scale));
  const height = Math.max(1, Math.round(region.height * scale));
  const paddedWidth = Math.ceil(width / 64) * 64, paddedHeight = Math.ceil(height / 64) * 64;
  const extend = { top: 0, left: 0, right: paddedWidth - width, bottom: paddedHeight - height, background: "black" };
  // Coverage pooling retains even one-pixel strokes when a large crop is reduced.
  const providerMask = Buffer.alloc(paddedWidth * paddedHeight);
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      if (image.mask[(y + region.top) * image.width + x + region.left] === 0) continue;
      providerMask[Math.min(height - 1, Math.floor(y * height / region.height)) * paddedWidth
        + Math.min(width - 1, Math.floor(x * width / region.width))] = 255;
    }
  }
  const [source, mask] = await Promise.all([
    sharp(image.pixels, { raw: { width: image.width, height: image.height, channels: 4 } })
      .extract(region).flatten({ background: "white" }).resize(width, height).extend(extend).png().toBuffer(),
    sharp(providerMask, { raw: { width: paddedWidth, height: paddedHeight, channels: 1 } }).png().toBuffer(),
  ]);
  return { source, mask, region, width, height, paddedWidth, paddedHeight };
}

/** Background removal may alter transparency, never regenerate the subject's colors or details. */
export async function applyBackgroundMatte(source: Buffer, output: Buffer): Promise<Buffer> {
  const { data: pixels, info } = await sharp(source).rotate().toColourspace("srgb").ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const metadata = await sharp(output).metadata();
  if (!metadata.hasAlpha || !metadata.width || !metadata.height
    || Math.abs(metadata.width / metadata.height - info.width / info.height) > 0.01) {
    throw new Error("Background removal did not return an aligned transparency mask");
  }
  const alpha = await sharp(output).extractChannel("alpha").resize(info.width, info.height).raw().toBuffer();
  const result = Buffer.from(pixels);
  for (let i = 0; i < alpha.length; i++) result[i * 4 + 3] = Math.round(pixels[i * 4 + 3] * alpha[i] / 255);
  return sharp(result, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

export async function restoreInpaintCrop(image: RetouchImage, crop: Awaited<ReturnType<typeof prepareInpaintCrop>>, output: Buffer) {
  const metadata = await sharp(output).metadata();
  if (metadata.width !== crop.paddedWidth || metadata.height !== crop.paddedHeight) {
    throw new Error("The retouch provider returned an incorrectly sized result");
  }
  const restored = await sharp(output).extract({ left: 0, top: 0, width: crop.width, height: crop.height })
    .resize(crop.region.width, crop.region.height).png().toBuffer();
  return compositeRetouch(image, restored, crop.region);
}
