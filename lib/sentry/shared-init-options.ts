const isProduction = process.env.NODE_ENV === "production";

/** Parse a sample rate from env (0–1). Falls back when missing or invalid. */
export function parseSentrySampleRate(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    return fallback;
  }
  return n;
}

export function resolveSentryDsn(side: "server" | "client"): string | undefined {
  const trim = (v: string | undefined) => v?.trim() || undefined;
  if (side === "client") {
    return trim(process.env.NEXT_PUBLIC_SENTRY_DSN) ?? trim(process.env.SENTRY_DSN);
  }
  return trim(process.env.SENTRY_DSN) ?? trim(process.env.NEXT_PUBLIC_SENTRY_DSN);
}

export function sentryEnableLogs(): boolean {
  if (process.env.SENTRY_ENABLE_LOGS === "true") {
    return true;
  }
  if (process.env.SENTRY_ENABLE_LOGS === "false") {
    return false;
  }
  return !isProduction;
}

export function sentryTracesSampleRate(): number {
  return parseSentrySampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    isProduction ? 0.1 : 1,
  );
}

export function sharedSentryInitOptions(side: "server" | "client") {
  return {
    dsn: resolveSentryDsn(side),
    tracesSampleRate: sentryTracesSampleRate(),
    enableLogs: sentryEnableLogs(),
    sendDefaultPii: false,
  };
}
