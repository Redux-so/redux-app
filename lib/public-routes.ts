/** Public page routes — no Clerk session required. */
export const PUBLIC_PAGE_ROUTES = [
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sso-callback",
];

/** Public API routes — verified via webhook signature in the route handler. */
export const PUBLIC_API_ROUTES = ["/api/webhooks/clerk", "/api/stripe/webhook", "/api/images/upload"];

/** Infrastructure routes — no user session (Sentry error tunnel). */
export const PUBLIC_INFRA_ROUTES = ["/monitoring"];

export const ALL_PUBLIC_ROUTES = [
  ...PUBLIC_PAGE_ROUTES,
  ...PUBLIC_API_ROUTES,
  ...PUBLIC_INFRA_ROUTES,
];
