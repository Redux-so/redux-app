const ALLOWED_RETURN_PATHS = new Set(["/library", "/editor"]);

/** Validates an in-app return path (no open redirects). */
export function isSafeAppReturnPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("://")) return false;

  const pathname = path.split("?")[0]?.split("#")[0] ?? "";
  return ALLOWED_RETURN_PATHS.has(pathname);
}

export function resolveSettingsReturnPath(
  returnTo: string | null | undefined,
): string {
  if (returnTo && isSafeAppReturnPath(returnTo)) {
    return returnTo;
  }
  return "/library";
}

export function buildSettingsHref(returnPath: string): string {
  const safe = resolveSettingsReturnPath(returnPath);
  return `/settings?returnTo=${encodeURIComponent(safe)}`;
}

export function settingsReturnLabel(returnPath: string): string {
  const pathname = returnPath.split("?")[0] ?? "";
  if (pathname === "/editor") return "Back to Editor";
  return "Back to Library";
}
