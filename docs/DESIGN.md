# Design system (as implemented)

Document what exists in code — do not invent new tokens. Source files: `lib/surface-colors.ts`, `lib/button-styles.ts`, `lib/panel-chrome.ts`, `app/globals.css`.

## Visual language

- **Dark UI:** main shell `#161616`, panels `#121212`, raised inputs `#1d1d1d`
- **Borders:** default `#2e2e2e`, focus/hover `#3a3a3a`
- **Primary CTAs (in-app):** purple `#8758ed` (hover `#9a6ff2`) — `BTN_PRIMARY_*` in `lib/button-styles.ts`
- **Modal primary buttons:** white `BTN_MODAL_*` (credit shop, upload, generative fill apply; Clerk UserProfile)
- **Accent token:** `--accent: #682FBF` (Tailwind `accent` — e.g. Advanced bundle highlight)
- **Ambient glow:** `#794ADE` — `.accent-glow-heading`, `.accent-glow-surface` on library greeting/search/upload
- **Chat user bubbles:** `#1e0d3a` (`USER_CHAT_BUBBLE_CLASS` in `ChatPanel.tsx`)

## Typography

- **Font in repo:** **Geist Sans** via `geist` package (`lib/fonts.ts`, `app/layout.tsx`, `--font-geist-sans` in `globals.css`)
- Panel titles: `14px font-semibold text-white` (`PANEL_TITLE`)
- Section labels (library): `text-xs font-semibold uppercase tracking-wide text-[#888888]`

*(Older notes mentioned Inter; current code uses Geist.)*

## Layout — editor

```
Toolbar (h-16)
├── Left: 72px tool rail + optional 360px section panel (432px total when open)
├── Center: canvas
└── Right: chat 360px expanded / 44px collapsed
```

- Tool rail: `AdjustmentPanel.tsx` — icons 26px, stroke 1.25, active `SURFACE_BTN_ACTIVE`
- Section panel: solid `#121212`, `rounded-r-2xl`, width transition 200ms; scroll resets on section change
- Chat: `rounded-l-2xl`, shared `PANEL_HEADER` / `PANEL_TITLE`
- Top toolbar: logo → library, zoom/before-after/undo/redo, filename / autosave / export

## Layout — library

- Sidebar **260px** (`LIBRARY_SIDEBAR_WIDTH_PX`): logo, filters, albums, trash, docs/help, profile
- Main: greeting + search + upload + grid (single scroll, `.scroll-stable`)
- Upload box retains its dark dashed surface for batch progress; skipped/failed files and a compact retry control appear below it
- Returning from the editor restores loaded pages, filters, sidebar selection and scroll position from a bounded account-scoped memory cache. Fresh server records take precedence. Successful saves update covers directly without resetting the list or showing a loading overlay.

## Layout — settings

- Max width ~880px; tab nav 172px desktop; sections in `components/settings/settings-nav.ts`
- Back navigation via `?returnTo=` (`lib/settings-navigation.ts`)

## Layout — 404

- Same `#161616` background and inherited Geist Sans as sign-in
- Centered 404 heading with a muted "This page couldn't be found" description and no header
- One centered brand button links to the library when signed in, or sign-in when signed out
- Incomplete editor links retain their previous-image recovery behavior

## Components and patterns

| Pattern | Where |
|---------|--------|
| Icons | `components/shared/Icon.tsx` only entry to `@untitledui/icons`; sizes 16/20/24 (rail uses 26) |
| Brand logo | `BrandLogo`, `AppChromeLogo`, `constants/brand.ts` |
| Profile | `ProfileMenu` — library footer + editor rail footer |
| Modals | Portals to `document.body` (export, credits, upload, chat dropdowns) |
| Toasts | One `AppToaster` in dashboard layout; bottom-right with safe-area spacing, opacity-only entry/exit, and shared styles in `lib/toast-styles.ts`; omit sentence punctuation in toast copy (including API messages) |
| Loading | `LoadingSpinner` / `LoadingOverlay` |
| Clerk auth UI | `ReduxClerkAuthShell`, `lib/redux-clerk-appearance.ts` |

## Border radii (convention)

- Side panels: `rounded-2xl`
- Modals/cards: `rounded-xl`
- Buttons/chips: `rounded-md`
- Inputs: `rounded-lg`
- Clerk buttons: ~6px radius (not pill)

## Interaction patterns

- Tool rail: click icon toggles section; same icon closes
- Chat: collapse strip; usage ring opens credit shop when quota blocked
- Library search: typewriter placeholder when empty/unfocused (`useTypewriterPlaceholder`)
- Slider double-click reset on label/thumb (`AdjustmentSlider`)

## Rules for UI changes

1. Reuse `SURFACE_*`, `BTN_*`, and `PANEL_*` tokens before adding one-off colors.
2. Import icons only through `Icon.tsx`.
3. Prefer extending existing panels over new layout systems.
4. Portal overlays that escape panel clipping when needed.
5. Preserve responsive behavior on settings tabs and library grid.
6. Visually verify in browser; check console for hydration warnings (known non-fatal warnings documented in dev scratch notes).

## Key dimensions (reference)

| Element | Size |
|---------|------|
| Tool rail | 72px |
| Section panel | 360px |
| Chat expanded / collapsed | 360px / 44px |
| Library sidebar | 260px |
| Toolbar height | 64px (h-16) |

Detailed file index for editor/library previously lived in `.context`; use component paths above and grep when implementing.
