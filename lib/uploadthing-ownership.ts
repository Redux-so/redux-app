import { UTApi } from "uploadthing/server";
import { validateTrustedMediaUrl } from "@/lib/trusted-media-url";

const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });

const LIST_FILES_PAGE_SIZE = 100;
const LIST_FILES_MAX_PAGES = 50;

export function normalizeMediaUrlForCompare(url: string): string {
  const parsed = new URL(url.trim());
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString();
}

/** Parse UploadThing file key from a trusted ufs / utfs delivery URL. */
export function parseUploadThingFileKeyFromTrustedUrl(urlString: string): string | null {
  let parsed: URL;
  try {
    parsed = validateTrustedMediaUrl(urlString);
  } catch {
    return null;
  }

  const pathname = parsed.pathname;
  const markers = ["/f/", "/file/"];
  for (const marker of markers) {
    const index = pathname.indexOf(marker);
    if (index === -1) continue;
    const key = decodeURIComponent(pathname.slice(index + marker.length));
    return key.length > 0 ? key : null;
  }

  return null;
}

/** True when UploadThing `customId` was stamped for this Redux user in middleware. */
export function isUploadThingCustomIdForUser(
  customId: string | null | undefined,
  userId: string,
): boolean {
  if (!customId) return false;
  return customId === userId || customId.startsWith(`${userId}:`);
}

async function findUploadThingFileByKey(fileKey: string) {
  for (let page = 0; page < LIST_FILES_MAX_PAGES; page += 1) {
    const { files, hasMore } = await utapi.listFiles({
      limit: LIST_FILES_PAGE_SIZE,
      offset: page * LIST_FILES_PAGE_SIZE,
    });

    const match = files.find((file) => file.key === fileKey);
    if (match) {
      return match;
    }

    if (!hasMore) {
      break;
    }
  }

  return null;
}

export type VerifyUploadThingOwnershipResult =
  | { ok: true; fileKey: string }
  | { ok: false; reason: "missing_token" | "invalid_url" | "url_key_mismatch" | "not_found" | "not_owned" };

/**
 * Verify that `ufsUrl` points at an UploadThing object owned by `userId`.
 * Never trust a client-supplied file key — derive from the trusted URL and confirm with UT API.
 */
export async function verifyUserUploadThingFile(
  userId: string,
  ufsUrl: string,
  clientSuppliedKey?: string | null,
): Promise<VerifyUploadThingOwnershipResult> {
  if (!process.env.UPLOADTHING_TOKEN) {
    return { ok: false, reason: "missing_token" };
  }

  const fileKey = parseUploadThingFileKeyFromTrustedUrl(ufsUrl);
  if (!fileKey) {
    return { ok: false, reason: "invalid_url" };
  }

  if (clientSuppliedKey && clientSuppliedKey !== fileKey) {
    return { ok: false, reason: "url_key_mismatch" };
  }

  const urlResult = await utapi.getFileUrls(fileKey);
  const resolved = urlResult.data[0];
  if (!resolved) {
    return { ok: false, reason: "not_found" };
  }

  if (normalizeMediaUrlForCompare(resolved.url) !== normalizeMediaUrlForCompare(ufsUrl)) {
    return { ok: false, reason: "url_key_mismatch" };
  }

  const fileRecord = await findUploadThingFileByKey(fileKey);
  if (!fileRecord) {
    return { ok: false, reason: "not_found" };
  }

  if (!isUploadThingCustomIdForUser(fileRecord.customId, userId)) {
    return { ok: false, reason: "not_owned" };
  }

  return { ok: true, fileKey };
}
