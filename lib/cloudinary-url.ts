const CLOUDINARY_UPLOAD = "/upload/";
const LIBRARY_THUMB_TRANSFORM = "w_400,h_400,c_fill,q_auto,f_auto";

function isCloudinaryDeliveryUrl(url: string): boolean {
  return url.includes("res.cloudinary.com") && url.includes(CLOUDINARY_UPLOAD);
}

/** First path segment after `/upload/` (transform string or version prefix). */
function uploadHeadSegment(url: string): string | null {
  const uploadIndex = url.indexOf(CLOUDINARY_UPLOAD);
  if (uploadIndex === -1) return null;

  const afterUpload = url.slice(uploadIndex + CLOUDINARY_UPLOAD.length);
  const slashIndex = afterUpload.indexOf("/");
  return slashIndex === -1 ? afterUpload : afterUpload.slice(0, slashIndex);
}

/**
 * Optimized Cloudinary delivery URL for library grid thumbnails.
 * Inserts w_400,h_400,c_fill,q_auto,f_auto when none present; skips double-transform.
 */
export function cloudinaryThumbnailUrl(url: string): string {
  if (!isCloudinaryDeliveryUrl(url)) {
    return url;
  }

  const uploadIndex = url.indexOf(CLOUDINARY_UPLOAD);
  const afterUpload = url.slice(uploadIndex + CLOUDINARY_UPLOAD.length);
  const head = uploadHeadSegment(url);
  if (!head) return url;

  // No transformation segment yet — path starts with v{version}/...
  if (/^v\d/.test(head)) {
    return `${url.slice(0, uploadIndex)}${CLOUDINARY_UPLOAD}${LIBRARY_THUMB_TRANSFORM}/${afterUpload}`;
  }

  if (head.includes("q_auto") && head.includes("f_auto")) {
    return url;
  }

  let merged = head;
  if (!head.includes("q_auto")) merged += ",q_auto";
  if (!head.includes("f_auto")) merged += ",f_auto";

  const tail = afterUpload.slice(head.length);
  return `${url.slice(0, uploadIndex)}${CLOUDINARY_UPLOAD}${merged}${tail}`;
}
