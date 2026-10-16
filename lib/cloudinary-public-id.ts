const CLOUDINARY_UPLOAD = "/upload/";

function isCloudinaryDeliveryUrl(url: string): boolean {
  return url.includes("res.cloudinary.com") && url.includes(CLOUDINARY_UPLOAD);
}

function looksLikeTransformSegment(segment: string): boolean {
  if (segment.includes(",")) return true;
  return /^(w|h|c|g|q|f|dpr|fl|a|b|e|o|r|t|u|x|y|z)_/.test(segment);
}

/**
 * Extract Cloudinary `public_id` (folder path, no extension) from a delivery URL.
 * Returns null for non-Cloudinary URLs or unparseable paths.
 */
export function cloudinaryPublicIdFromDeliveryUrl(url: string): string | null {
  if (!isCloudinaryDeliveryUrl(url)) {
    return null;
  }

  const uploadIndex = url.indexOf(CLOUDINARY_UPLOAD);
  let remainder = url.slice(uploadIndex + CLOUDINARY_UPLOAD.length).split("?")[0] ?? "";

  while (remainder.length > 0) {
    const slashIndex = remainder.indexOf("/");
    const segment = slashIndex === -1 ? remainder : remainder.slice(0, slashIndex);

    if (/^v\d+$/.test(segment)) {
      remainder = slashIndex === -1 ? "" : remainder.slice(slashIndex + 1);
      break;
    }

    if (looksLikeTransformSegment(segment)) {
      remainder = slashIndex === -1 ? "" : remainder.slice(slashIndex + 1);
      continue;
    }

    break;
  }

  if (!remainder) {
    return null;
  }

  return remainder.replace(/\.[^/.]+$/, "");
}
