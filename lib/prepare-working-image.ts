import { appPath } from "@/lib/app-path";
/** Register local crop/resize pixels through the existing owned source-version endpoint. */
export async function prepareWorkingImage(imageId: string, source: string, signal?: AbortSignal): Promise<string> {
  if (!source.startsWith("data:")) return source;
  const response = await fetch(appPath("/api/images/versions"), {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ imageId, adjustments: {}, sourceOnly: true, imageBase64: source.split(",")[1] }),
  });
  if (!response.ok) throw new Error("Could not prepare the current image. No tool was run.");
  const data = await response.json() as { sourceUrl?: string };
  if (!data.sourceUrl) throw new Error("Could not prepare the current image. No tool was run.");
  return data.sourceUrl;
}
