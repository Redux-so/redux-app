# Architecture

Verified from the repository unless marked **uncertain**.

## Stack overview

| Layer | Technology |
|-------|------------|
| Framework | **Next.js 16** App Router (`app/`) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS 4 |
| Auth | **Clerk** (`proxy.ts`, `@clerk/nextjs`) |
| Database | **PostgreSQL** (Neon) via **Prisma 5** |
| Vector search | **pgvector** on `Image.embedding` (768-d); raw SQL via `lib/pgvector.ts` |
| Uploads | Authenticated **multipart POST** `app/api/images` → **Cloudinary** |
| Media storage / transforms | **Cloudinary** (`lib/cloudinary.ts`) — source of truth for originals, previews, and AI outputs |
| Canvas | **Fabric.js** (`components/editor/Canvas.tsx`, `hooks/useCanvas.ts`) |
| AI chat / vision | **Anthropic** (`lib/anthropic.ts`, model id in `constants/ai-models.ts`) |
| AI inpainting / CLIP / some models | **Replicate** (`lib/replicate.ts`, various routes) |
| Payments | **Stripe** (checkout, portal, webhook) |
| Rate limiting | **Vercel KV** when `KV_REST_API_URL` is set (`lib/kv.ts`) |
| Errors | **Sentry** (`withSentryConfig` in `next.config.ts`, instrumentation) |
| Icons | **@untitledui/icons** via `components/shared/Icon.tsx` only |

## Authentication

- `proxy.ts` (Next.js 16 replacement for `middleware.ts`): `clerkMiddleware` + `auth.protect()` for non-public routes
- Public routes: `lib/public-routes.ts` (landing, sign-in/up, SSO callback, webhooks, Sentry tunnel)
- API handlers resolve DB user via `lib/require-user.ts` (`clerkId` → `User`)
- Unknown page URLs reach `app/not-found.tsx`, which replaces the URL with the last valid app page stored per tab (including query parameters); fresh tabs fall back to `/`. Keep `isAppPagePath` in `lib/last-visited-page.ts` synchronized with page routes so private pages retain proxy authentication. APIs retain their JSON error behavior.
- Editor URLs are remembered after their image loads successfully. Missing/empty image IDs and images returning 404 use the same recovery component without overwriting the previous URL; recovery to the current URL falls back to `/` to prevent loops.
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

Prisma client singleton: `lib/prisma.ts` (`@prisma/client` is a runtime dependency; `postinstall` runs `prisma generate`).

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
- **State:** React hooks — `useEditor`, `useCanvas`, `use-undo`; preview refresh via `EditorPreviewContext`
- **No global Redux store** — name is product brand only

## Media and image pipeline

1. Upload → `POST /api/images` (multipart) → Cloudinary `redux/` folder → `Image` row (`originalUrl`, `publicId`)
2. Legacy rows may still have `utKey` (UploadThing); permanent delete removes both Cloudinary assets and any remaining UploadThing keys
3. Editor loads `previewUrl ?? originalUrl`
4. Adjustments: shared local Canvas 2D renderer updates canvas immediately and renders export pixels at native dimensions; Sharp only transforms/encodes those pixels (`lib/interactive-image-preview.ts`, `lib/apply-image-adjustments.ts`)
5. AI ops update Cloudinary / `previewUrl` and may create versions
6. Embeddings: `lib/image-vector-pipeline.ts`, `pnpm run embed:all` script

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
Upload → Cloudinary + DB Image → Library grid
Library → Editor (imageId) → useEditor loads versions/adjustments
Slider change → local image render → canvas → auto-save → ImageVersion
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
- Matcher in `proxy.ts` excludes static files (`.*\\..*`)

Editor render contract, export synchronization, and color limitations: [EDITOR_RENDERING.md](EDITOR_RENDERING.md).
