const isProduction = process.env.NODE_ENV === "production";

/** Avoid logging full user-provided text in production (logs may reach Sentry). */
export function logSnippetForDiagnostics(text: string): string {
  if (!isProduction) {
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  }
  return `(len=${text.length})`;
}
