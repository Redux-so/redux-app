import type { ClerkMiddlewareOptions } from "@clerk/nextjs/server";

/** Clerk production / fraud-protection hosts (see Clerk CSP guide). */
const CLERK_CSP_HOSTS = {
  "script-src": [
    "https://challenges.cloudflare.com",
    "https://*.protect.clerk.com",
    "https://*.clerk.com",
    "https://clerk.com",
  ],
  "connect-src": [
    "https://*.protect.clerk.com:*",
    "https://*.clerk.com",
    "https://clerk.com",
  ],
  "frame-src": ["https://*.protect.clerk.com", "https://*.clerk.com"],
} as const satisfies Record<string, string[]>;

/** CSP directives merged with Clerk defaults in `proxy.ts`. */
export const REDUX_CSP_DIRECTIVES = {
  "img-src": [
    "data:",
    "blob:",
    "https://res.cloudinary.com",
    "https://*.ufs.sh",
    "https://utfs.io",
  ],
  "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
  "style-src": ["https://fonts.googleapis.com"],
  "connect-src": [
    "https://res.cloudinary.com",
    "https://*.ufs.sh",
    "https://utfs.io",
    "https://uploadthing.com",
    "https://*.uploadthing.com",
    "https://*.ingest.us.sentry.io",
  ],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
} as const satisfies Record<string, string[]>;

/** Clerk middleware CSP: strict nonces in production; dev keeps unsafe-eval for HMR. */
export function clerkContentSecurityPolicyOptions(): ClerkMiddlewareOptions {
  return {
    contentSecurityPolicy: {
      strict: process.env.NODE_ENV === "production",
      directives: {
        "script-src": [...CLERK_CSP_HOSTS["script-src"]],
        "connect-src": [
          ...CLERK_CSP_HOSTS["connect-src"],
          ...REDUX_CSP_DIRECTIVES["connect-src"],
        ],
        "frame-src": [...CLERK_CSP_HOSTS["frame-src"]],
        "img-src": [...REDUX_CSP_DIRECTIVES["img-src"]],
        "font-src": [...REDUX_CSP_DIRECTIVES["font-src"]],
        "style-src": [...REDUX_CSP_DIRECTIVES["style-src"]],
        "object-src": [...REDUX_CSP_DIRECTIVES["object-src"]],
        "base-uri": [...REDUX_CSP_DIRECTIVES["base-uri"]],
      },
    },
  };
}

export function buildSecurityHeaders(isProduction: boolean) {
  const headers = [
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ] as const;

  if (isProduction) {
    return [
      ...headers,
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ] as const;
  }

  return headers;
}
