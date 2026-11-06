# Development guide

## Package manager

**pnpm** (lockfile: `pnpm-lock.yaml`)

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm run dev` | Dev server (Turbopack; `NODE_OPTIONS` raises memory) |
| `pnpm run build` | Production build |
| `pnpm run start` | Run production server locally |
| `pnpm run lint` | ESLint (`eslint .`) |
| `pnpm run typecheck` | Generate Next.js route types, then run TypeScript (`next typegen && tsc --noEmit`) |
| `pnpm run test` | CI test gate — runs static `scripts/verify-*.ts` checks (no DB/network); fails if `*.test.*` / `*.spec.*` exist without a runner |
| `pnpm run embed:all` | Regenerate CLIP embeddings (`scripts/reembed-images.ts`) |

**Tests:** there is no unit/e2e runner yet. `pnpm run test` only verifies that test files are not added without wiring a runner. Add Vitest/Jest (or similar) before introducing `*.test.*` / `*.spec.*` files.

## Continuous integration

GitHub Actions workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on **pull requests to `main`**:

1. `pnpm install --frozen-lockfile`
2. `pnpm exec prisma generate`
3. `pnpm run lint`
4. `pnpm run typecheck`
5. `pnpm run test`
6. `pnpm run build`

CI uses **placeholder** env vars for Prisma and Clerk so compile/generate succeed without real secrets. Optional repo secret: **`SENTRY_AUTH_TOKEN`** (Sentry source map upload during build; omit if not needed).

## Prisma

| Command | Purpose |
|---------|---------|
| `pnpm exec prisma generate` | Generate client after schema changes |
| `pnpm exec prisma migrate dev` | Local migrations (use intentionally) |
| `pnpm exec prisma db seed` | Seed credit bundles (`prisma/seed.ts`) |
| `pnpm exec prisma studio` | DB UI (often port 5555) |

**Database:** PostgreSQL with `DATABASE_URL` and `DIRECT_URL`. Enable pgvector in Neon:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

After adding images without embeddings, run `pnpm run embed:all`.

## Environment variables

Use **`.env`** (Prisma/server) and **`.env.local`** (Next.js). Both should include shared values where noted in scratch docs (e.g. `NEXT_PUBLIC_APP_URL`).

Never commit secrets. Names referenced in code:

| Variable | Used for |
|----------|----------|
| `DATABASE_URL`, `DIRECT_URL` | Prisma / Neon |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk (standard Clerk setup) |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook Svix verification |
| `CLOSED_BETA_STARTER_CREDITS` | One-time credit bonus for newly provisioned accounts. Defaults to 150 for invite-only signup. Set it to 0 before opening signup. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary |
| `UPLOADTHING_TOKEN` | Legacy UploadThing cleanup on permanent delete (optional for new-only dev) |
| `ANTHROPIC_API_KEY` | Chat / vision AI |
| `REPLICATE_API_TOKEN` | Replicate models (heal, CLIP, etc.) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe |
| `CREDIT_PURCHASES_ENABLED` | Credit shop and checkout switch. Defaults to off. Set to `true` and deploy to enable new purchases. |
| `NEXT_PUBLIC_APP_URL` | Checkout redirect URLs |
| `KV_REST_API_URL` (+ related KV vars per Vercel) | Rate limiting |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN (public DSN for browser; set both or only `NEXT_PUBLIC_SENTRY_DSN` if shared) |
| `SENTRY_AUTH_TOKEN` | Sentry source map upload (CI/build) |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry webpack plugin (optional; defaults match current project) |
| `SENTRY_TRACES_SAMPLE_RATE` | Trace sampling 0–1 (default `0.1` production, `1` development) |
| `SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, `SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE` | Session Replay sampling (client; lower defaults in production) |
| `SENTRY_ENABLE_LOGS` | Send console logs to Sentry (`true` / `false`; default off in production) |

Optional script vars: `REEMBED_BETWEEN_REPLICATE_MS`, `REEMBED_ALL`, `DEV_MEMORY_ROUTES`.

Copy [`.env.example`](../.env.example) to `.env` / `.env.local` and replace placeholders. Real env files stay gitignored.

## Local services

- **PostgreSQL (Neon)** — required for auth-linked data and library
- **Clerk** — required for sign-in and protected routes
- **Cloudinary, Stripe, Anthropic, Replicate** — required for full feature testing; **UploadThing** only if testing purge of legacy `utKey` assets
- **Vercel KV** — optional locally; rate limits may no-op if unset (`lib/kv.ts`)
- **ngrok** — only for local Stripe webhook testing (see scratch notes)

## Start the app

```bash
pnpm install
pnpm exec prisma generate
pnpm run dev
```

Open `http://localhost:3000`. Sign in via Clerk for dashboard routes.

## Validate a change

`node scripts/verify-style-match.mjs` checks the oversized target regression,
JPEG/PNG/WebP/TIFF decoding, encoded size and orientation, storage-independent
preparation, browser reference downsizing, chat dispatch, safe provider errors,
rate-limit guidance and charge/refund behavior. Pixel checks verify independent
sky/grass/building palette transfer, texture and alpha preservation, native output
dimensions, and different pixels for different references. Provider responses are
mocked; verify a real Style Match with a large saved working image before release.

`node scripts/verify-upload-performance.mjs` checks upload profile-read overhead,
parallel cover/original storage, preserved originals, preview fallback/cleanup,
and unchanged request safeguards. `POST /api/images` reports auth, validation,
storage and database durations in `Server-Timing` for real-network diagnosis.
The validation duration includes multipart reading and rate-limit checks; the
storage duration includes any initial cover preparation. Tests mock providers,
so compare actual uploads in the Network panel to assess network/provider delay.

`node scripts/verify-retouch.mjs` checks actual Sharp pixels outside painted
selections, alpha preservation, crop/mask alignment, transformed Fabric brush
coordinates, canvas relayout, local source registration and retouch route
storage/refunds. Provider calls and storage are mocked; live inpainting quality
and phone/desktop brush interaction still require manual verification.

For library onboarding, `node scripts/verify-introduction.mjs` checks step navigation, account dismissal, persistence errors/retry and Settings replay without calling Clerk. Verify the square dialog, focus handling and new-account dismissal across refreshes in a signed-in browser too.

For responsive library/editor changes, `node scripts/verify-mobile-layout.mjs`
checks real component handlers, breakpoint switching, keyboard viewport tracking,
canvas measurement and touch gestures, and compiles the client modules and CSS.
These checks do not replace visual testing in mobile Safari/Chrome. Check phone
portrait/landscape and a tablet, including typing in chat, opening menus, painting,
cropping, saving, exporting, and returning to the library.

1. `pnpm run lint`
2. `pnpm run typecheck`
3. `pnpm run build` for non-trivial or cross-route changes
3. Manual QA: library, editor with `?imageId=`, settings, auth
4. For UI: confirm layout, interactions, and browser console
5. For API/AI: exercise route with authenticated session; verify credits and 401/404 behavior

## Workflows (manual vs Cloud Agent)

- **Local manual Cursor:** [MANUAL_DEVELOPMENT_WORKFLOW.md](MANUAL_DEVELOPMENT_WORKFLOW.md) — default; Git stays under your control unless you ask otherwise.
- **Cursor Cloud Agent / Linear:** [CLOUD_AGENT_WORKFLOW.md](CLOUD_AGENT_WORKFLOW.md).

## Superpowers (Cursor)

Optional Agent plugin for planning/debugging/verification workflows. Install and precedence vs Redux rules: [SUPERPOWERS.md](SUPERPOWERS.md).

## Cloud Agent environment notes

- Full app behavior requires external services and env vars; agents may be blocked on auth or missing keys.
- Read `/docs` before large changes; editor layout details are in [DESIGN.md](DESIGN.md).
- Next.js **16** — check `node_modules/next/dist/docs/` when APIs differ from training data.
## Brand assets

- In-app logo: `assets/brand/redux-mark.png`, `constants/brand.ts`
- Auth hero: `scripts/process-auth-hero.mjs` → `assets/brand/auth-hero.jpg`
- Favicons: `scripts/process-favicons.mjs` → `public/favicon.png`
- Mutable stable URLs (`/logo.png`, favicons): short `Cache-Control` in `next.config.ts`; hashed imports skip stale cache.

Development disables Turbopack filesystem caching because local CSS changes were observed being restored from stale cache across server restarts. In-memory incremental compilation remains enabled; a cold restart may take longer. Production build caching is unchanged.

For phone testing, use the computer's private Wi-Fi address and the dev server port on the same network. `next.config.ts` permits the computer's current private IPv4 addresses as development origins, so Next.js can serve client assets and HMR to the phone. Restart the dev server after changing networks. Production origins are unchanged.

Client history and chat IDs use `lib/create-uuid.ts`, which falls back to UUID v4 bytes from `crypto.getRandomValues` on local HTTP origins where `crypto.randomUUID` is unavailable. Mobile regression checks cover this path, slider callbacks, brush sizes, chat entry, and menu selection.
