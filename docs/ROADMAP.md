# Roadmap

Informational only. **GitHub Issues** are the operational task queue. Items below are taken from existing project notes (`.devnotes`, phase tracking).

## Current priorities

From dev notes — **Phase 10: Deployment**

- Polish and performance cleanup
- Deploy to Vercel
- Connect subdomain `studio.yourdomain.com` (wording from devnotes; exact domain not verified in repo)
- Update service URLs to production
- Switch Stripe from test to live mode
- Set up production Clerk keys
- Set up production Stripe webhook endpoint

## Planned / operational follow-ups

- Replace Docs/Help placeholder URLs in `constants/support.ts` when real destinations exist
- **Uncertain:** custom icons for flip H/V (`TransformPanel` — noted as candidate in devnotes)

## Bugs / technical debt

From known issues (scratch notes):

- Hydration mismatch warning in console — treated as non-fatal
- Editor rail icon size 26px vs Icon type restriction 16|20|24 — known TS flag in notes
- `TransformPanel.tsx` marked legacy/unused — transform UI lives in `AdjustmentPanel`
- Turbopack occasional panics in dev (environment-specific; not tracked as product bug in docs)

## Future ideas

No separate future-ideas list was documented beyond deployment and polish above.

## Historical context

A long **Completed** checklist exists in `.devnotes` (features shipped through mid-2026). It is not duplicated here to avoid stale duplication; refer to `.devnotes` **Completed** section for a feature-level changelog, or infer shipped features from [PRODUCT.md](PRODUCT.md) and git history.
