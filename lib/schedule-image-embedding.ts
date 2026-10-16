import { after } from "next/server";
import { logApiError } from "@/lib/api-error";
import { generateAndPersistImageEmbedding } from "@/lib/image-vector-pipeline";

const BACKGROUND_EMBED_MAX_ATTEMPTS = 2;
const BACKGROUND_EMBED_RETRY_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBackgroundImageEmbedding(
  routeLabel: string,
  imageId: string,
  imageUrl: string,
  userId: string,
): Promise<void> {
  for (let attempt = 1; attempt <= BACKGROUND_EMBED_MAX_ATTEMPTS; attempt++) {
    try {
      await generateAndPersistImageEmbedding(imageId, imageUrl, userId);
      return;
    } catch (err) {
      logApiError(
        `${routeLabel} background embedding (attempt ${attempt}/${BACKGROUND_EMBED_MAX_ATTEMPTS})`,
        err,
      );
      if (attempt >= BACKGROUND_EMBED_MAX_ATTEMPTS) {
        console.error(
          `[${routeLabel}] background embedding failed after ${BACKGROUND_EMBED_MAX_ATTEMPTS} attempt(s) imageId=${imageId} userId=${userId}`,
        );
        return;
      }
      await sleep(BACKGROUND_EMBED_RETRY_DELAY_MS);
    }
  }
}

/**
 * CLIP embedding after the HTTP response (Vercel `waitUntil` via Next `after()`).
 * Does not block the client; logs and retries once on failure.
 */
export function scheduleImageEmbeddingAfterResponse(
  routeLabel: string,
  imageId: string,
  imageUrl: string,
  userId: string,
): void {
  after(() => runBackgroundImageEmbedding(routeLabel, imageId, imageUrl, userId));
}
