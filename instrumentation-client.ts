// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import {
  parseSentrySampleRate,
  sharedSentryInitOptions,
} from "@/lib/sentry/shared-init-options";

const isProduction = process.env.NODE_ENV === "production";

Sentry.init({
  ...sharedSentryInitOptions("client"),
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: parseSentrySampleRate(
    process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ??
      process.env.SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
    isProduction ? 0 : 0.1,
  ),
  replaysOnErrorSampleRate: parseSentrySampleRate(
    process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ??
      process.env.SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
    isProduction ? 0.25 : 1,
  ),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
