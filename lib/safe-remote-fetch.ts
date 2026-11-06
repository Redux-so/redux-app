import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EDITOR_SOURCE_MAX_BYTES } from "@/constants/image-upload";
import { pipeline } from "node:stream/promises";
import {
  UntrustedUrlError,
  assertHostnameResolvesToPublicAddresses,
  validateReplicateDeliveryUrl,
  validateTrustedMediaUrl,
} from "@/lib/trusted-media-url";

export const REMOTE_FETCH_LIMITS = {
  TIMEOUT_MS: 30_000,
  /** Align with upload ceiling in API_LIMITS. */
  MAX_BYTES: 50 * 1024 * 1024,
  MAX_EDITOR_BYTES: EDITOR_SOURCE_MAX_BYTES,
  MAX_REDIRECTS: 3,
} as const;

export class SafeFetchError extends Error {
  readonly code:
    | "UNTRUSTED_URL"
    | "TIMEOUT"
    | "TOO_LARGE"
    | "FETCH_FAILED"
    | "REDIRECT"
    | "ABORTED";

  constructor(
    message: string,
    code: SafeFetchError["code"],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "SafeFetchError";
    this.code = code;
  }
}

export type SafeFetchBufferResult = {
  buffer: Buffer;
  contentType: string | null;
  status: number;
  finalUrl: string;
};

async function* limitedBody(response: Response, maxBytes: number) {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new SafeFetchError("Response body too large", "TOO_LARGE");
  }
  if (!response.body) return;

  const reader = response.body.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new SafeFetchError("Response body too large", "TOO_LARGE");
      yield value;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function readBuffer(response: Response, finalUrl: string): Promise<SafeFetchBufferResult> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of limitedBody(response, REMOTE_FETCH_LIMITS.MAX_BYTES)) chunks.push(chunk);
  return { buffer: Buffer.concat(chunks), contentType: response.headers.get("content-type"),
    status: response.status, finalUrl };
}

function mapUntrustedUrlError(err: UntrustedUrlError): SafeFetchError {
  return new SafeFetchError(err.message, "UNTRUSTED_URL", { cause: err });
}

async function validateUrlForFetch(
  urlString: string,
  validate: (url: string) => URL,
): Promise<URL> {
  try {
    const parsed = validate(urlString);
    await assertHostnameResolvesToPublicAddresses(parsed.hostname);
    return parsed;
  } catch (err) {
    if (err instanceof UntrustedUrlError) {
      throw mapUntrustedUrlError(err);
    }
    throw err;
  }
}

async function fetchWithAllowlist<T>(
  initialUrl: string,
  validate: (url: string) => URL,
  read: (response: Response, finalUrl: string) => Promise<T>,
): Promise<T> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= REMOTE_FETCH_LIMITS.MAX_REDIRECTS; redirectCount++) {
    const parsed = await validateUrlForFetch(currentUrl, validate);

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, REMOTE_FETCH_LIMITS.TIMEOUT_MS);

    try {
      const response = await fetch(parsed.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) throw new SafeFetchError("Redirect missing Location header", "REDIRECT");
        if (redirectCount >= REMOTE_FETCH_LIMITS.MAX_REDIRECTS) {
          throw new SafeFetchError("Too many redirects", "REDIRECT");
        }
        try {
          currentUrl = new URL(location, parsed.href).href;
        } catch {
          throw new SafeFetchError("Invalid redirect URL", "REDIRECT");
        }
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        throw new SafeFetchError(
          `Remote fetch failed with status ${response.status}`,
          "FETCH_FAILED",
        );
      }
      return await read(response, parsed.href);
    } catch (err) {
      if (controller.signal.aborted) {
        throw new SafeFetchError("Remote fetch timed out", "TIMEOUT", { cause: err });
      }
      if (err instanceof SafeFetchError) throw err;
      throw new SafeFetchError("Remote fetch failed", "FETCH_FAILED", { cause: err });
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new SafeFetchError("Too many redirects", "REDIRECT");
}

/** Fetch bytes from a user-supplied Cloudinary or UploadThing URL. */
export async function fetchTrustedMediaBuffer(
  url: string,
): Promise<SafeFetchBufferResult> {
  return fetchWithAllowlist(url, validateTrustedMediaUrl, readBuffer);
}

/** Fetch Replicate model output after `replicate.run()` — not for client URLs. */
export async function fetchReplicateDeliveryBuffer(
  url: string,
): Promise<SafeFetchBufferResult> {
  return fetchWithAllowlist(url, validateReplicateDeliveryUrl, readBuffer);
}

/** Stage a checked working-image URL on disk so Sharp can open it without a full encoded copy in memory. */
export async function stageTrustedEditorImage(url: string) {
  const directory = await mkdtemp(join(tmpdir(), "redux-editor-"));
  const path = join(directory, "source");
  const cleanup = () => rm(directory, { recursive: true, force: true }).catch(() => {});
  try {
    await fetchWithAllowlist(url, validateTrustedMediaUrl, async (response) => {
      await pipeline(limitedBody(response, REMOTE_FETCH_LIMITS.MAX_EDITOR_BYTES), createWriteStream(path));
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
  return { path, cleanup };
}

export async function withTrustedEditorImage<T>(url: string, processImage: (path: string) => Promise<T>): Promise<T> {
  const image = await stageTrustedEditorImage(url);
  try {
    return await processImage(image.path);
  } finally {
    await image.cleanup();
  }
}
