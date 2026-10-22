import { NextResponse } from "next/server";
import { imageStorageErrorBody } from "@/lib/image-storage";

/** Client-visible API error body — never include stack traces, DB errors, or internal details. */
export type ApiErrorBody = {
  error: string;
};

export const API_ERROR_MESSAGE = {
  unauthorized: "Unauthorized",
  badRequest: "Bad request",
  notFound: "Not found",
  internal: "Internal server error",
} as const;

export function apiErrorResponse(message: string, status: number): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: message }, { status });
}

export function apiUnauthorizedResponse(): NextResponse<ApiErrorBody> {
  return apiErrorResponse(API_ERROR_MESSAGE.unauthorized, 401);
}

export function logApiError(routeLabel: string, err: unknown): void {
  console.error(`[${routeLabel}]`, err);
  if (err instanceof Error) {
    if (err.message) {
      console.error(`[${routeLabel}] message:`, err.message);
    }
    if (err.stack) {
      console.error(`[${routeLabel}] stack:`, err.stack);
    }
  }
}

/** Log internally and return a safe 500 with a generic or route-specific public message. */
export function apiInternalErrorResponse(
  routeLabel: string,
  err: unknown,
  publicMessage: string = API_ERROR_MESSAGE.internal,
): NextResponse<ApiErrorBody> {
  logApiError(routeLabel, err);
  const storageError = imageStorageErrorBody(err);
  if (storageError) return NextResponse.json(storageError, { status: storageError.retryable ? 503 : 413 });
  return apiErrorResponse(publicMessage, 500);
}
