import Replicate from "replicate";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { fetchReplicateDeliveryBuffer } from "@/lib/safe-remote-fetch";
import { prepareInpaintCrop, restoreInpaintCrop, type RetouchImage } from "@/lib/retouch-image";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
// Context-based LaMa inpainting, shared by Heal and Eraser; no text generation prompt.
const MODEL = "zylim0702/remove-object:0e3a841c913f597c1e4c321560aa69e2bc1f15c65f8c366caafc379240efd8ba";

function outputUrl(output: unknown): string {
  const value: unknown = Array.isArray(output) ? output[0] : output;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "url" in value && typeof value.url === "function") {
    return String(value.url());
  }
  throw new Error("No retouch image returned");
}

export async function inpaintSelection(image: RetouchImage, imageId: string, tool: "heal" | "erase") {
  const crop = await prepareInpaintCrop(image);
  const [source, mask] = await Promise.all([
    uploadToCloudinary(crop.source, `${tool}_input_${imageId}.png`),
    uploadToCloudinary(crop.mask, `${tool}_mask_${imageId}.png`),
  ]);
  const output = await replicate.run(MODEL, { input: { image: source.secureUrl, mask: mask.secureUrl } });
  const { buffer } = await fetchReplicateDeliveryBuffer(outputUrl(output));
  return restoreInpaintCrop(image, crop, buffer);
}
