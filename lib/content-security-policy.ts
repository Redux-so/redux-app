import type { ClerkMiddlewareOptions } from "@clerk/nextjs/server";

/** CSP directives merged with Clerk defaults in `proxy.ts`. */
export const REDUX_CSP_DIRECTIVES = {
  "img-src": [
    "data:",
    "blob:",
    "https://res.cloudinary.com",
    "https://*.ufs.sh",
    "https://utfs.io",
  ],
  "font-src": ["data:", "https://fonts.gstatic.com"],
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
        "img-src": [...REDUX_CSP_DIRECTIVES["img-src"]],
        "font-src": [...REDUX_CSP_DIRECTIVES["font-src"]],
        "style-src": [...REDUX_CSP_DIRECTIVES["style-src"]],
        "connect-src": [...REDUX_CSP_DIRECTIVES["connect-src"]],
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
