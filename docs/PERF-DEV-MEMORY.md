# Dev server memory (PERF-10)

## Summary

Redux dev was configured with an **8 GB** Node heap (`NODE_OPTIONS='--max-old-space-size=8192'` on `pnpm run dev`) after Turbopack/Next dev hit out-of-memory crashes during normal editing. The primary **app-code** driver was `components/shared/Icon.tsx` using a **namespace import** of `@untitledui/icons`, which re-exports **~2,300 icons** (~4,700 files under `node_modules/@untitledui/icons/dist`). Turbopack must trace and compile that entire graph for any client route that imports `Icon`, which matches “dev RAM climbs into many GB” and intermittent Turbopack panics.

## Fix (verified)

- **`components/shared/icon-registry.ts`** — explicit subpath imports for the **49** icons used in the app (`@untitledui/icons/IconName`).
- **`components/shared/Icon.tsx`** — resolves icons from the registry only (no package barrel).
- **`scripts/verify-icon-registry.mjs`** — fails CI-style checks if a new `Icon` name is used without a registry entry.

Run: `node scripts/verify-icon-registry.mjs`

## Measurement notes (Cloud Agent, Oct 2026)

| Scenario | Peak RSS (all `node` processes) | Notes |
|----------|----------------------------------|--------|
| Dev running, barrel `Icon` (pre-fix) | ~492 MB | Unauthenticated route fetch only; protected UI not fully exercised |
| Dev running, registry `Icon` (post-fix) | ~366 MB | Same script (`registry-icons` label) |

Cloud runs **under-report** peak vs local machines: authenticated **Library / Editor** sessions compile larger client graphs (Fabric, panels, chat). The barrel import scales with **icon package size**, not route count.

Helper: `node scripts/measure-dev-memory.mjs --label <name>`

## Other contributors (not changed in PERF-10)

| Factor | Role |
|--------|------|
| **Turbopack + Next 16 dev** | Keeps large module graphs in memory; panics often correlate with heap pressure (see [ROADMAP.md](./ROADMAP.md)). |
| **`@sentry/nextjs` + `withSentryConfig`** | Extra dev instrumentation; `widenClientFileUpload` affects **production** source maps, not dev graph size directly. |
| **Fabric.js** (`hooks/useCanvas.ts`) | Loaded via **dynamic** `import("fabric")` on the editor — heavy at runtime, but not the ~4k icon module fan-out. |
| **Canvas/chat leak fixes** (commit `21e91d0`) | Addressed **runtime** leaks; the 8 GB heap limit was added in the same change set as a dev stability workaround. |

## After the icon registry

- Prefer keeping **`verify-icon-registry.mjs`** when adding icons.
- Consider **lowering** `--max-old-space-size` from `8192` after local QA if dev stays stable (optional follow-up; default left at 8192 until teams confirm on macOS/Windows).

## Manual QA checklist

1. `pnpm run dev`
2. Sign in; open **Library** and **Editor** (`?imageId=` if available)
3. Watch Activity Monitor / Task Manager Node RSS for 5–10 minutes while switching panels
4. Compare to pre-fix branch if investigating regressions
5. Re-run a Turbopack flow that previously crashed (large import graph / HMR on `Icon.tsx`)
