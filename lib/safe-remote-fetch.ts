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

async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new SafeFetchError("Response body too large", "TOO_LARGE");
    }
  }

  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new SafeFetchError("Response body too large", "TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
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

async function fetchWithAllowlist(
  initialUrl: string,
  validate: (url: string) => URL,
): Promise<SafeFetchBufferResult> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= REMOTE_FETCH_LIMITS.MAX_REDIRECTS; redirectCount++) {
    const parsed = await validateUrlForFetch(currentUrl, validate);

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, REMOTE_FETCH_LIMITS.TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(parsed.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new SafeFetchError("Remote fetch timed out", "TIMEOUT", { cause: err });
      }
      throw new SafeFetchError("Remote fetch failed", "FETCH_FAILED", { cause: err });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SafeFetchError("Redirect missing Location header", "REDIRECT");
      }

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
      throw new SafeFetchError(
        `Remote fetch failed with status ${response.status}`,
        "FETCH_FAILED",
      );
    }

    const buffer = await readBodyWithLimit(response, REMOTE_FETCH_LIMITS.MAX_BYTES);
    const contentType = response.headers.get("content-type");

    return {
      buffer,
      contentType,
      status: response.status,
      finalUrl: parsed.href,
    };
  }

  throw new SafeFetchError("Too many redirects", "REDIRECT");
}

/** Fetch bytes from a user-supplied Cloudinary or UploadThing URL. */
export async function fetchTrustedMediaBuffer(
  url: string,
): Promise<SafeFetchBufferResult> {
  return fetchWithAllowlist(url, validateTrustedMediaUrl);
}

/** Fetch Replicate model output after `replicate.run()` — not for client URLs. */
export async function fetchReplicateDeliveryBuffer(
  url: string,
): Promise<SafeFetchBufferResult> {
  return fetchWithAllowlist(url, validateReplicateDeliveryUrl);
}
