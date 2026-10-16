# Decision log

Extracted from project notes and code. Dates are **unknown** unless noted. Reasons are documented only where notes provided them.

## Decision: Credit-based monetization (no subscriptions)

Context: Business model for AI features.

Decision: One-time **credit bundles** via Stripe; features deduct credits per use.

Reason: Documented in dev notes as explicit product choice.

---

## Decision: 20 lifetime free chat messages

Context: Free tier for AI chat assistant.

Decision: Track usage on `User.lifetimeFreeAI`; chat blocked when free exhausted and `creditBalance` is 0.

Reason: Documented in dev notes; enforced in API + `UsageRing` UI.

---

## Decision: CSS filters for preview, Sharp for export

Context: Real-time editor vs downloaded file quality.

Decision: Canvas uses CSS/Fabric preview; export path uses Sharp server-side processing.

Reason: Documented in dev notes.

---

## Decision: CLIP image embeddings for semantic search

Context: Library search implementation.

Decision: 768-d vectors on `Image.embedding` (pgvector); not text-only embeddings.

Reason: Documented in dev notes; schema uses `Unsupported("vector(768)")`.

---

## Decision: Cloudinary folder name `redux`

Context: Cloudinary organization.

Decision: Store assets under folder **redux**.

Reason: Documented in dev notes; not verified in code in this pass.

---

## Decision: Editor chrome layout (rail + panels + chat)

Context: Editor UX refactor.

Decision: 72px tool rail, optional 360px section panel, 360/44px chat panel; history on rail not top toolbar; no bottom nav.

Reason: Documented in dev notes and reflected in `EditorApp` / `AdjustmentPanel`.

---

## Decision: Auto-save every 30 seconds and on unmount

Context: Persisting editor state.

Decision: `useEditor` saves on interval when dirty and on navigation away; reopen loads latest `ImageVersion` adjustments.

Reason: Documented in dev notes.

---

## Decision: previewUrl for AI/destructive edits

Context: Thumbnails and canvas after AI ops.

Decision: AI operations set `Image.previewUrl`; UI uses `previewUrl ?? originalUrl`.

Reason: Documented in dev notes.

---

## Decision: Export modal download-only

Context: Save vs export UX.

Decision: Export modal triggers download; library persistence via auto-save/versions.

Reason: Documented in dev notes.

---

## Decision: Purple in-app CTAs, white modal CTAs

Context: Button hierarchy.

Decision: `BTN_PRIMARY_*` purple for app chrome and credit AI buttons; `BTN_MODAL_*` white for modal footers and Clerk UserProfile; export download uses purple to match toolbar.

Reason: Documented in dev notes and `lib/button-styles.ts`.

---

## Decision: Single Icon wrapper for UntitledUI

Context: Icon consistency.

Decision: Only `components/shared/icon-registry.ts` imports `@untitledui/icons` (subpath per icon); `Icon.tsx` reads the registry. Lucide removed.

Reason: Avoids Turbopack dev importing the full ~2.3k-icon package barrel (see [PERF-DEV-MEMORY.md](./PERF-DEV-MEMORY.md)).

---

## Decision: Clerk dark theme + custom appearance

Context: Auth and settings profile modals.

Decision: `@clerk/themes` dark base; `lib/redux-clerk-appearance.ts` for brand alignment.

Reason: Documented in dev notes.

---

## Decision: Surface token system

Context: Cross-app dark UI consistency.

Decision: Centralize in `lib/surface-colors.ts` (`#161616` / `#121212` / `#1d1d1d` / borders).

Reason: Documented in dev notes (Jul 2026 pass).

---

## Decision: Settings via profile menu + returnTo query

Context: Navigation from library/editor to settings.

Decision: No bottom nav; `ProfileMenu` in sidebar/rail; `?returnTo=/library|/editor` validated in `lib/settings-navigation.ts`.

Reason: Documented in dev notes.

---

## Decision: Brightness folded into exposure

Context: Redundant sliders.

Decision: Remove brightness slider; legacy brightness merges into exposure on load/export.

Reason: Documented in dev notes; verify in adjustment code when touching export.

---

## Decision: Temperature / tint / hue via overlay compositing

Context: Color adjustments preview and export.

Decision: Soft-light/color blend overlays (`lib/color-overlays.ts`), not hue-rotate only.

Reason: Documented in dev notes.

---

## Decision: Rate limits per feature

Context: AI abuse prevention.

Decision: Hourly limits via KV; per-minute burst limits documented in dev notes (see `.devnotes` Rate Limits section for numeric values).

Reason: Documented in dev notes; implementation in `lib/kv.ts` and routes.

---

## Decision: Public route manifest

Context: Middleware vs webhooks.

Decision: `lib/public-routes.ts` lists pages, signed webhooks, and Sentry tunnel.

Reason: Security section in dev notes.

---

## Decision: Single favicon asset

Context: Browser tab icon.

Decision: One squircle favicon (`public/favicon.png`) for all themes; generated via `scripts/process-favicons.mjs`.

Reason: Recent product change in repository (post devnotes freeze).
