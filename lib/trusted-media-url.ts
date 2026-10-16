import dns from "node:dns/promises";
import net from "node:net";

/** Host patterns allowed for user-supplied media URLs (HTTPS only). */
export const TRUSTED_MEDIA_HOST_PATTERNS = [
  "res.cloudinary.com",
  "utfs.io",
  "*.ufs.sh",
  "uploadthing.com",
  "*.uploadthing.com",
] as const;

/** Replicate model output delivery — not accepted from clients, only from API responses. */
export const REPLICATE_DELIVERY_HOST_PATTERNS = [
  "replicate.delivery",
  "*.replicate.delivery",
] as const;

export class UntrustedUrlError extends Error {
  readonly code = "UNTRUSTED_URL" as const;

  constructor(message: string) {
    super(message);
    this.name = "UntrustedUrlError";
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

export function hostnameMatchesPattern(hostname: string, pattern: string): boolean {
  const host = normalizeHostname(hostname);
  const pat = normalizeHostname(pattern);
  if (pat.startsWith("*.")) {
    const suffix = pat.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  return host === pat;
}

export function hostnameMatchesAnyPattern(
  hostname: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) => hostnameMatchesPattern(hostname, pattern));
}

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map((part) => Number(part));
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / shared address space
    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") return true;
    if (normalized.startsWith("fe80:")) return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      if (net.isIPv4(mapped)) return isBlockedIp(mapped);
    }
    return false;
  }

  return true;
}

function assertNotLocalHostname(hostname: string): void {
  const host = normalizeHostname(hostname);
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new UntrustedUrlError("Localhost URLs are not allowed");
  }
}

export function parseHttpsUrl(urlString: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    throw new UntrustedUrlError("Invalid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new UntrustedUrlError("Only HTTPS URLs are allowed");
  }

  if (parsed.username || parsed.password) {
    throw new UntrustedUrlError("URL credentials are not allowed");
  }

  if (!parsed.hostname) {
    throw new UntrustedUrlError("Invalid URL host");
  }

  assertNotLocalHostname(parsed.hostname);

  if (net.isIP(parsed.hostname)) {
    if (isBlockedIp(parsed.hostname)) {
      throw new UntrustedUrlError("Private or local network URLs are not allowed");
    }
    throw new UntrustedUrlError("Untrusted URL host");
  }

  return parsed;
}

export function assertHostnameInAllowlist(
  hostname: string,
  patterns: readonly string[],
): void {
  assertNotLocalHostname(hostname);

  if (net.isIP(hostname)) {
    throw new UntrustedUrlError("Untrusted URL host");
  }

  if (!hostnameMatchesAnyPattern(hostname, patterns)) {
    throw new UntrustedUrlError("Untrusted URL host");
  }
}

export async function assertHostnameResolvesToPublicAddresses(
  hostname: string,
): Promise<void> {
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new UntrustedUrlError("Private or local network URLs are not allowed");
    }
    return;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UntrustedUrlError("Could not resolve URL host");
  }

  if (addresses.length === 0) {
    throw new UntrustedUrlError("Could not resolve URL host");
  }

  for (const entry of addresses) {
    if (isBlockedIp(entry.address)) {
      throw new UntrustedUrlError("Private or local network URLs are not allowed");
    }
  }
}

export function validateTrustedMediaUrl(urlString: string): URL {
  const parsed = parseHttpsUrl(urlString);
  assertHostnameInAllowlist(parsed.hostname, TRUSTED_MEDIA_HOST_PATTERNS);
  return parsed;
}

export function validateReplicateDeliveryUrl(urlString: string): URL {
  const parsed = parseHttpsUrl(urlString);
  assertHostnameInAllowlist(parsed.hostname, REPLICATE_DELIVERY_HOST_PATTERNS);
  return parsed;
}

export function isTrustedMediaHttpUrl(value: string): boolean {
  try {
    validateTrustedMediaUrl(value);
    return true;
  } catch {
    return false;
  }
}
