import { NextResponse } from "next/server";
import { z } from "zod";
import { EDITOR_HISTORY_LIMIT } from "@/lib/editor-history";
import { DEFAULT_ADJUSTMENTS } from "@/constants/adjustments";
import { isTrustedMediaHttpUrl } from "@/lib/trusted-media-url";

/** Shared limits for API request validation (SEC-05). */
export const API_LIMITS = {
  RESOURCE_ID_MAX_LEN: 128,
  URL_MAX_LEN: 2048,
  /** Max decoded bytes for inline base64 image payloads (~10 MiB). */
  BASE64_MAX_BYTES: 10 * 1024 * 1024,
  /** Character ceiling before decoding (base64 expands ~4/3). */
  BASE64_MAX_CHARS: 14 * 1024 * 1024,
  MASK_BASE64_MAX_BYTES: 4 * 1024 * 1024,
  MASK_BASE64_MAX_CHARS: 6 * 1024 * 1024,
  CHAT_USER_MESSAGE_MAX: 8_000,
  CHAT_HISTORY_MAX_MESSAGES: 20,
  CHAT_HISTORY_MESSAGE_MAX: 4_000,
  SEARCH_QUERY_MAX: 500,
  EXPORT_QUALITY_MIN: 1,
  EXPORT_QUALITY_MAX: 100,
  EXPORT_MAX_WIDTH_MIN: 1,
  EXPORT_MAX_WIDTH_MAX: 16_384,
  PROMPT_MAX_LEN: 2_000,
  EXPAND_PIXELS_MIN: 1,
  EXPAND_PIXELS_MAX: 512,
  BLUR_INTENSITY_MIN: 1,
  BLUR_INTENSITY_MAX: 100,
  ALBUM_NAME_MAX: 80,
  VERSION_LABEL_MAX: 120,
  UPLOAD_NAME_MAX: 255,
  UPLOAD_SIZE_MAX: 50 * 1024 * 1024,
  ADJUSTMENT_MIN: -100,
  ADJUSTMENT_MAX: 100,
  MAX_ADJUSTMENT_KEYS: 32,
  TRANSFORM_ROTATION_MIN: -360,
  TRANSFORM_ROTATION_MAX: 360,
  TRANSFORM_STRAIGHTEN_MIN: -45,
  TRANSFORM_STRAIGHTEN_MAX: 45,
} as const;

const adjustmentKeys = Object.keys(DEFAULT_ADJUSTMENTS) as [
  keyof typeof DEFAULT_ADJUSTMENTS,
  ...(keyof typeof DEFAULT_ADJUSTMENTS)[],
];

export const resourceIdSchema = z
  .string()
  .trim()
  .min(1, "id is required")
  .max(API_LIMITS.RESOURCE_ID_MAX_LEN);

function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isDataImageUrl(value: string): boolean {
  if (!value.startsWith("data:image/")) return false;
  return value.includes(";base64,");
}

export const httpImageUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(API_LIMITS.URL_MAX_LEN)
  .refine(isHttpOrHttpsUrl, "imageUrl must be a valid http(s) URL")
  .refine(
    isTrustedMediaHttpUrl,
    "imageUrl must be a trusted Cloudinary or UploadThing HTTPS URL",
  );

export const dataImageUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(API_LIMITS.URL_MAX_LEN + API_LIMITS.BASE64_MAX_CHARS)
  .refine(isDataImageUrl, "Invalid data image URL");

/** Cloudinary / remote URL or inline data URL (editor workspace). */
export const workspaceImageUrlSchema = z.union([
  httpImageUrlSchema,
  dataImageUrlSchema,
]);

function base64DecodedByteLength(value: string): number {
  const normalized = value.replace(/\s/g, "");
  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function isBase64Charset(value: string): boolean {
  const normalized = value.replace(/\s/g, "");
  return normalized.length > 0 && /^[A-Za-z0-9+/=]+$/.test(normalized);
}

export function createBase64PayloadSchema(maxBytes: number, maxChars: number) {
  return z
    .string()
    .min(1)
    .max(maxChars)
    .refine(isBase64Charset, "Invalid base64 encoding")
    .refine(
      (value) => base64DecodedByteLength(value) <= maxBytes,
      "Base64 payload too large",
    );
}

export const base64PayloadSchema = createBase64PayloadSchema(
  API_LIMITS.BASE64_MAX_BYTES,
  API_LIMITS.BASE64_MAX_CHARS,
);

// Lossless working compositions can be larger than an uploaded JPEG.
export const workingImageBase64Schema = createBase64PayloadSchema(
  API_LIMITS.UPLOAD_SIZE_MAX,
  Math.ceil(API_LIMITS.UPLOAD_SIZE_MAX / 3) * 4,
);

export const maskBase64Schema = createBase64PayloadSchema(
  API_LIMITS.MASK_BASE64_MAX_BYTES,
  API_LIMITS.MASK_BASE64_MAX_CHARS,
);

const adjustmentFieldSchemas = Object.fromEntries(
  adjustmentKeys.map((key) => [
    key,
    z
      .number()
      .finite()
      .min(API_LIMITS.ADJUSTMENT_MIN)
      .max(API_LIMITS.ADJUSTMENT_MAX),
  ]),
) as Record<
  (typeof adjustmentKeys)[number],
  z.ZodNumber
>;

export const adjustmentsRecordSchema = z
  .object(adjustmentFieldSchemas)
  .partial()
  .refine(
    (record) => Object.keys(record).length <= API_LIMITS.MAX_ADJUSTMENT_KEYS,
    "Too many adjustment keys",
  );

export const imageTransformSchema = z.object({
  rotation: z
    .number()
    .finite()
    .min(API_LIMITS.TRANSFORM_ROTATION_MIN)
    .max(API_LIMITS.TRANSFORM_ROTATION_MAX),
  flipX: z.boolean(),
  flipY: z.boolean(),
  straighten: z
    .number()
    .finite()
    .min(API_LIMITS.TRANSFORM_STRAIGHTEN_MIN)
    .max(API_LIMITS.TRANSFORM_STRAIGHTEN_MAX),
});

export const exportFormatSchema = z.enum(["jpeg", "png", "tiff"]);

export const exportBodySchema = z.object({
  pixelsRendered: z.boolean().optional().default(false),
  imageId: resourceIdSchema,
  adjustments: adjustmentsRecordSchema.optional().default({}),
  format: exportFormatSchema.optional().default("jpeg"),
  quality: z
    .number()
    .int()
    .min(API_LIMITS.EXPORT_QUALITY_MIN)
    .max(API_LIMITS.EXPORT_QUALITY_MAX)
    .optional()
    .default(90),
  imageUrl: workspaceImageUrlSchema.optional(),
  imageBase64: workingImageBase64Schema.optional(),
  transform: imageTransformSchema.optional(),
  width: z.number().int().min(1).max(API_LIMITS.EXPORT_MAX_WIDTH_MAX).optional(),
  height: z.number().int().min(1).max(API_LIMITS.EXPORT_MAX_WIDTH_MAX).optional(),
  maxWidth: z
    .number()
    .int()
    .min(API_LIMITS.EXPORT_MAX_WIDTH_MIN)
    .max(API_LIMITS.EXPORT_MAX_WIDTH_MAX)
    .optional(),
}).refine((body) => (body.width === undefined) === (body.height === undefined), "Width and height must be supplied together")
  .refine((body) => !body.width || !body.height || body.width * body.height <= 64_000_000, "Output exceeds 64 megapixels");

export const previewMutationBodySchema = z.object({
  pixelsRendered: z.boolean().optional().default(false),
  persist: z.boolean().optional().default(true),
  /** Monotonic client generation — stale responses must not overwrite previewUrl. */
  previewGeneration: z.number().int().min(1).optional(),
  adjustments: adjustmentsRecordSchema.optional().default({}),
  imageUrl: workspaceImageUrlSchema.optional(),
  imageBase64: workingImageBase64Schema.optional(),
  transform: imageTransformSchema.optional(),
});

export const chatImageMediaTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export const chatHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(API_LIMITS.CHAT_HISTORY_MESSAGE_MAX),
});

export const chatRequestBodySchema = z.object({
  turnId: z.string().uuid().optional(),
  userMessage: z
    .string()
    .trim()
    .min(1, "userMessage is required")
    .max(API_LIMITS.CHAT_USER_MESSAGE_MAX),
  adjustments: adjustmentsRecordSchema.optional().default({}),
  conversationHistory: z
    .array(chatHistoryMessageSchema)
    .max(API_LIMITS.CHAT_HISTORY_MAX_MESSAGES)
    .optional()
    .default([]),
  imageId: resourceIdSchema.optional(),
  workspaceImageUrl: workspaceImageUrlSchema.optional(),
  imageBase64: base64PayloadSchema.optional(),
  imageMediaType: chatImageMediaTypeSchema.optional(),
  chatInteractionMode: z.enum(["agent", "ask"]).optional().default("agent"),
});

export const imageUrlOnlyBodySchema = z.object({
  imageUrl: httpImageUrlSchema,
  currentAdjustments: adjustmentsRecordSchema.optional(),
});

export const imageUrlAndIdBodySchema = z.object({
  imageUrl: httpImageUrlSchema,
  imageId: resourceIdSchema,
});

export const maskImageOperationBodySchema = z.object({
  imageUrl: httpImageUrlSchema,
  maskBase64: maskBase64Schema,
  imageId: resourceIdSchema,
});

export const blurImageBodySchema = maskImageOperationBodySchema.extend({
  blurIntensity: z
    .number()
    .int()
    .min(API_LIMITS.BLUR_INTENSITY_MIN)
    .max(API_LIMITS.BLUR_INTENSITY_MAX)
    .optional()
    .default(30),
});

export const styleMatchBodySchema = z.object({
  imageUrl: httpImageUrlSchema,
  referenceImageBase64: base64PayloadSchema,
  referenceImageMediaType: chatImageMediaTypeSchema,
});

export const expandDirectionSchema = z.enum([
  "top",
  "bottom",
  "left",
  "right",
]);

export const generativeFillBodySchema = z.object({
  imageUrl: httpImageUrlSchema,
  expandDirection: expandDirectionSchema,
  expandPixels: z.coerce
    .number()
    .int()
    .min(API_LIMITS.EXPAND_PIXELS_MIN)
    .max(API_LIMITS.EXPAND_PIXELS_MAX),
  prompt: z
    .string()
    .trim()
    .min(1, "prompt is required")
    .max(API_LIMITS.PROMPT_MAX_LEN),
});

export const embedImageBodySchema = z.object({
  imageId: resourceIdSchema,
  imageUrl: httpImageUrlSchema,
});

export const deleteImageBodySchema = z.object({
  imageId: resourceIdSchema,
});

/** Library / trash mutations — preview URLs are server-generated only. */
export const patchImageBodySchema = z
  .object({
    isFavorite: z.boolean().optional(),
    restore: z.literal(true).optional(),
  })
  .refine(
    (body) => body.isFavorite !== undefined || body.restore === true,
    "isFavorite or restore is required",
  );

const editorHistoryStateSchema = z.object({
  v: z.literal(2),
  sliders: adjustmentsRecordSchema,
  transform: imageTransformSchema,
  workingImageUrl: z.union([httpImageUrlSchema, z.string().regex(/^history-image:\d+$/)]).nullable(),
  workingWidth: z.number().int().positive().nullable(),
  workingHeight: z.number().int().positive().nullable(),
});

const editorHistoryBodySchema = z.object({
  v: z.literal(1),
  cursor: z.number().int().nonnegative(),
  entries: z.array(z.object({
    id: z.string().min(1).max(128),
    label: z.string().min(1).max(120),
    createdAt: z.string().max(40),
    state: editorHistoryStateSchema,
  })).min(1).max(EDITOR_HISTORY_LIMIT),
}).refine((history) => history.cursor < history.entries.length, "Invalid history position");

export const saveVersionBodySchema = z.object({
  sourceOnly: z.boolean().optional().default(false),
  history: editorHistoryBodySchema.optional(),
  historyImages: z.array(workingImageBase64Schema).max(EDITOR_HISTORY_LIMIT).optional()
    .refine((images) => !images || images.reduce((size, image) => size + base64DecodedByteLength(image), 0) <= API_LIMITS.UPLOAD_SIZE_MAX,
      "History images exceed the upload limit"),
  coverBase64: workingImageBase64Schema.optional(),
  saveGeneration: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  imageId: resourceIdSchema,
  adjustments: z.record(z.string(), z.unknown()),
  imageBase64: workingImageBase64Schema.optional(),
  label: z.string().trim().max(API_LIMITS.VERSION_LABEL_MAX).refine((label) => !label.startsWith("__"), "This version name is reserved").optional(),
}).refine((body) => !body.sourceOnly || !!body.imageBase64, "A working image is required");

export const albumNameBodySchema = z.object({
  name: z.string().trim().min(1).max(API_LIMITS.ALBUM_NAME_MAX),
});

export const albumImageBodySchema = z.object({
  imageId: resourceIdSchema,
});

export const checkoutBodySchema = z.object({
  bundleId: resourceIdSchema,
});

export const searchQuerySchema = z
  .string()
  .trim()
  .min(1, "query is required")
  .max(API_LIMITS.SEARCH_QUERY_MAX);

export function formatValidationError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "Invalid request";
  const path = first.path.length ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

export function validationErrorResponse(error: z.ZodError): NextResponse {
  return NextResponse.json(
    { error: formatValidationError(error) },
    { status: 400 },
  );
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export function parseRequestBody<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): ParseResult<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, response: validationErrorResponse(result.error) };
  }
  return { ok: true, data: result.data };
}

export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; raw: unknown } | { ok: false; response: NextResponse }> {
  try {
    const raw: unknown = await request.json();
    return { ok: true, raw };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
}

export async function parseJsonRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ParseResult<T>> {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return bodyResult;
  }
  return parseRequestBody(schema, bodyResult.raw);
}

export function parseResourceIdParam(id: string): ParseResult<string> {
  return parseRequestBody(resourceIdSchema, id);
}

export function parseSearchQueryParam(
  raw: string | null,
): ParseResult<string> {
  return parseRequestBody(searchQuerySchema, raw ?? "");
}
