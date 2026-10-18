import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./lib/content-security-policy";

const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  transpilePackages: ["geist"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "*.ufs.sh",
      },
      {
        protocol: "https",
        hostname: "utfs.io",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/favicon.png",
        permanent: true,
      },
    ];
  },
  async headers() {
    const securityHeaders = buildSecurityHeaders(isProduction);

    /** Stable URLs that change when brand art is reprocessed (not content-hashed). */
    const mutablePublicAssetCache = [
      {
        key: "Cache-Control",
        value: "public, max-age=3600, must-revalidate",
      },
    ] as const;

    return [
      {
        source: "/:path*\\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Later rules override earlier ones for the same path (Next.js headers merge).
      {
        source: "/favicon.png",
        headers: [...mutablePublicAssetCache],
      },
      {
        source: "/apple-touch-icon.png",
        headers: [...mutablePublicAssetCache],
      },
      {
        source: "/logo.png",
        headers: [...mutablePublicAssetCache],
      },
      {
        source: "/favicon.ico",
        headers: [...mutablePublicAssetCache],
      },
      {
        source: "/:path*",
        headers: [...securityHeaders],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: process.env.SENTRY_ORG ?? "redux-xn",

  project: process.env.SENTRY_PROJECT ?? "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
