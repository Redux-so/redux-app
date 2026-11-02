import { CHAT_VISION_MAX_PX, isChatImageMediaType } from "@/lib/chat-image-shared";

/** Prepare chat and Style Match references before the browser sends their full-size file. */
export async function prepareVisionFile(file: File): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, CHAT_VISION_MAX_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the reference image");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    const [header, base64] = dataUrl.split(",");
    const rawType = header.replace("data:", "").replace(";base64", "");
    if (!base64 || !isChatImageMediaType(rawType)) throw new Error("Could not prepare the reference image");
    return { dataUrl, base64, mediaType: rawType };
  } finally { bitmap.close(); }
}
