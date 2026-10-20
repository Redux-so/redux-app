import { LIBRARY_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/constants/app-routes";

export const LAST_VISITED_PAGE_KEY = "redux:last-visited-page";

/** Keep in sync with app page routes; API and infrastructure routes are excluded */
export function isAppPagePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return ["/", LIBRARY_PATH, "/editor", "/settings", "/sso-callback"].includes(path)
    || path === SIGN_IN_PATH || path.startsWith(`${SIGN_IN_PATH}/`)
    || path === SIGN_UP_PATH || path.startsWith(`${SIGN_UP_PATH}/`);
}

/** Only restore local app pages, never external URLs or one-time SSO callbacks */
export function safePreviousPage(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  try {
    const base = "https://redux.invalid";
    const url = new URL(value, base);
    if (url.origin !== base || !isAppPagePath(url.pathname)
      || url.pathname.replace(/\/+$/, "") === "/sso-callback") return null;
    if (url.pathname.replace(/\/+$/, "") === "/editor"
      && !url.searchParams.get("imageId")?.trim()) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function rememberVisitedPage(value: string): void {
  const page = safePreviousPage(value);
  if (!page) return;
  try {
    sessionStorage.setItem(LAST_VISITED_PAGE_KEY, page);
  } catch {
    // Navigation still works when browser storage is disabled
  }
}
