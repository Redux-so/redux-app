# Product

## What Redux is

Redux is an **AI-powered photo editing web application**. Users upload photos, organize them in a library, and edit in a canvas-based editor with adjustments, AI tools, and a conversational assistant that can suggest and apply edits.

## Purpose

- Provide a browser-based photo workflow: **library → editor → export**
- Combine **real-time preview** (CSS/Fabric) with **server-side export** (Sharp)
- Monetize **AI features** via **credits** (one-time bundles), with a small **free chat** allowance

## Target users

Photographers and creators who want quick AI-assisted edits and organization without a desktop app. (Specific personas are not documented in the repository.)

## Major workflows

### Library (`/library`)

- Upload via dropzone → server → Cloudinary
- Browse grid with favorites, recents, albums, trash
- Semantic search (CLIP embeddings + pgvector)
- Open editor for an image

### Editor (`/editor?imageId=…`)

- Adjust light, color, effects, retouch, transform
- AI tools (enhance, tone, color balance, style match, heal, generative fill, background removal)
- Version history and restore
- Chat assistant with vision (streaming)
- Auto-save (~30s) and export download

### Settings (`/settings`)

- Profile (Clerk UserProfile)
- Billing & credits (Stripe bundles, transaction history)
- Storage stats
- About

### Auth

- Sign-in / sign-up (Clerk), custom shell and forms

## Implemented product areas (verified in repo)

| Area | Primary locations |
|------|-------------------|
| Library | `app/(dashboard)/library/page.tsx`, `components/library/*` |
| Editor | `app/(dashboard)/editor/page.tsx`, `components/editor/*` |
| Settings | `app/(dashboard)/settings/page.tsx` |
| Credits / shop | `CreditShopModal`, `app/api/credits/*`, Stripe checkout + webhook |
| AI chat | `app/api/ai/chat/route.ts`, `ChatPanel.tsx` |
| AI image features | `app/api/ai/*` (enhance, tone, heal, etc.) |
| Semantic search | `app/api/ai/search/route.ts`, embeddings on `Image` |
| Albums & trash | `app/api/albums/*`, `app/api/trash/route.ts` |

## Core features

- **Adjustments:** exposure, contrast, highlights/shadows, vibrance, temperature/tint/hue (see `constants/adjustments.ts`)
- **Canvas:** zoom, pan, before/after, undo/redo (`hooks/useCanvas.ts`, `useEditor.ts`)
- **AI (credit-gated):** costs in `constants/credits.ts`; free tier gets **20 lifetime chat messages** then credits required
- **Semantic search:** credit cost 3; CLIP 768-d vectors on `Image.embedding`
- **Export:** formats via export modal; Sharp processing server-side
- **Monetization:** credit bundles (Starter through Enterprise); no subscriptions documented

## Terminology

| Term | Meaning |
|------|---------|
| Credits | Currency for AI features; stored on `User.creditBalance` |
| Lifetime free AI | Counter on `User.lifetimeFreeAI`; used for chat free tier (20 messages) |
| Image version | Saved edit state (`ImageVersion`) with adjustments JSON |
| Preview URL | `Image.previewUrl` — result after destructive/AI ops; thumbnails prefer preview over original |
| Public ID | Cloudinary asset id |
| utKey | Legacy UploadThing file key (optional; new uploads omit) |

## Product constraints (documented)

- **Free tier:** JPEG/PNG export; AI blocked except 20 free chat messages (see `.devnotes` / decisions log)
- **Paid users:** JPEG, PNG, TIFF; AI with credits (exact gating logic lives in API routes — verify when changing billing)
- Chat blocked when free exhausted **and** credit balance is 0
- Support contact documented as **admin@redux.so**
- Docs/Help links in app point to placeholders in `constants/support.ts` (`REDUX_DOCS_URL`, `REDUX_HELP_FEEDBACK_URL`)
