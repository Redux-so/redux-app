# Architecture

Verified from the repository unless marked **uncertain**.

## Stack overview

| Layer | Technology |
|-------|------------|
| Framework | **Next.js 16** App Router (`app/`) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS 4 |
| Auth | **Clerk** (`middleware.ts`, `@clerk/nextjs`) |
| Database | **PostgreSQL** (Neon) via **Prisma 5** |
| Vector search | **pgvector** on `Image.embedding` (768-d); raw SQL via `lib/pgvector.ts` |
| Uploads | **UploadThing** (`app/api/uploadthing/`) |
| Media storage / transforms | **Cloudinary** (`lib/cloudinary.ts`) |
| Canvas | **Fabric.js** (`components/editor/Canvas.tsx`, `hooks/useCanvas.ts`) |
| AI chat / vision | **Anthropic** (`lib/anthropic.ts`, model `claude-sonnet-4-5` in chat UI) |
| AI inpainting / CLIP / some models | **Replicate** (`lib/replicate.ts`, various routes) |
| Payments | **Stripe** (checkout, portal, webhook) |
| Rate limiting | **Vercel KV** when `KV_REST_API_URL` is set (`lib/kv.ts`) |
| Errors | **Sentry** (`withSentryConfig` in `next.config.ts`, instrumentation) |
| Icons | **@untitledui/icons** via `components/shared/Icon.tsx` only |

**Uncertain / not wired in app code (present in `package.json` only):** `inngest`, `posthog-js` — no imports found in application source at documentation time.

## Authentication

- `middleware.ts`: `clerkMiddleware` + `auth.protect()` for non-public routes
- Public routes: `lib/public-routes.ts` (landing, sign-in/up, SSO callback, webhooks, Sentry tunnel)
- API handlers resolve DB user via `lib/require-user.ts` (`clerkId` → `User`)
- Clerk webhook syncs users: `app/api/webhooks/clerk/route.ts` (Svix + `CLERK_WEBHOOK_SECRET`)

Clerk also requires standard **`NEXT_PUBLIC_CLERK_*`** publishable/secret keys (Clerk convention; not referenced explicitly in grep).

## Data layer (Prisma)

Schema: `prisma/schema.prisma`

| Model | Role |
|-------|------|
| `User` | `clerkId`, credits, `lifetimeFreeAI` |
| `Image` | URLs, dimensions, optional `embedding`, soft delete `deletedAt` |
| `ImageVersion` | History snapshots (adjustments JSON) |
| `Album` / `AlbumImage` | User albums |
| `CreditTransaction` | Purchases and deductions |
| `CreditBundle` | Catalog for Stripe prices |

Prisma client singleton: `lib/prisma.ts`. Neon adapter package is listed in dependencies; confirm adapter usage in `lib/prisma.ts` when changing DB setup.

## API / backend

- **Pattern:** Route handlers under `app/api/**/route.ts`
- **Auth:** Most routes call `requireAuthUser()` or Clerk `auth()`
- **AI routes:** credit check, rate limits, optional `assertUserOwnsImageUrl` for `imageUrl` params
- **Streaming:** Chat uses SSE from `app/api/ai/chat/route.ts`
- **Webhooks:** Clerk (user sync), Stripe (credit purchase)

Representative routes:

- Images CRUD, versions, export, blur/erase, preview generation
- `app/api/ai/*` — enhance, tone, chat, search, heal, generative-fill, background-remove, style-match, color-balance
- Credits, albums, trash, user stats/library

## Frontend architecture

- **Routes:** `app/(dashboard)/*` (library, editor, settings), `app/(auth)/*`, marketing `app/page.tsx`
- **Editor shell:** client `EditorApp.tsx` composes Toolbar, AdjustmentPanel, Canvas, ChatPanel
- **State:** React hooks — `useEditor`, `useCanvas`, `use-undo`, `use-immer`; preview refresh via `EditorPreviewContext`
- **No global Redux store** — name is product brand only

## Media and image pipeline

1. Upload → UploadThing → record in DB + Cloudinary public id
2. Editor loads `previewUrl ?? originalUrl`
3. Adjustments: CSS filters on canvas; export composes via Sharp (`lib/apply-image-adjustments.ts`, color overlays)
4. AI ops update Cloudinary / `previewUrl` and may create versions
5. Embeddings: `lib/image-vector-pipeline.ts`, `pnpm run embed:all` script

Cloudinary folder name **redux** (documented in decisions).

## Security (implemented)

- CSP and headers: `lib/content-security-policy.ts`, `next.config.ts`
- User-scoped queries by `userId`
- Public route manifest avoids protecting webhooks incorrectly

## Directory structure (high level)

```
app/                 App Router pages and API routes
components/        UI (editor/, library/, shared/, auth/, settings/)
hooks/               Client editor/canvas hooks
lib/                 Server utilities, AI, Cloudinary, Prisma helpers
constants/           Feature costs, layout tokens, chat config
prisma/              Schema and seed
public/              Static assets (logo, favicon)
scripts/             Brand/favicon processing, re-embed images
docs/                Project documentation (this tree)
```

## Major data flows

```text
Upload → DB Image → Library grid
Library → Editor (imageId) → useEditor loads versions/adjustments
Slider change → canvas preview → auto-save → ImageVersion
AI button → POST /api/ai/* → credits + Cloudinary → previewUrl update
Chat → POST /api/ai/chat (SSE) → optional adjustment patches → canvas
Search → POST /api/ai/search → pgvector similarity
Purchase → Stripe checkout → webhook → creditBalance +=
```

## Environment dependencies

See [docs/DEVELOPMENT.md](DEVELOPMENT.md) for variable names (no secret values). App expects `.env` and `.env.local` (not committed).

## Architectural constraints

- Secrets only on server; Cloudinary secret, Stripe, Anthropic, Replicate, UploadThing tokens never exposed to client
- Next.js 16 conventions — consult local `node_modules/next/dist/docs/` when unsure
- Matcher in middleware excludes static files (`.*\\..*`)
