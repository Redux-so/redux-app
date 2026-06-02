/** Build CSP string for Next.js headers (dev may need unsafe-eval for HMR). */
export function buildContentSecurityPolicy(isDev: boolean): string {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://*.clerk.accounts.dev",
    "https://clerk.com",
    "https://challenges.cloudflare.com",
    "https://js.stripe.com",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://res.cloudinary.com https://img.clerk.com https://*.ufs.sh https://utfs.io https://*.stripe.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    [
      "connect-src 'self'",
      "https://*.clerk.accounts.dev",
      "https://clerk.com",
      "https://res.cloudinary.com",
      "https://*.ufs.sh",
      "https://utfs.io",
      "https://uploadthing.com",
      "https://*.uploadthing.com",
      "https://api.stripe.com",
      "https://*.stripe.com",
      "https://*.ingest.us.sentry.io",
    ].join(" "),
    "frame-src 'self' https://*.clerk.accounts.dev https://clerk.com https://challenges.cloudflare.com https://js.stripe.com https://hooks.stripe.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export const SECURITY_HEADERS = [
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
