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
- Section labels (library): `text-xs font-medium uppercase tracking-wide text-[#888888]`

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

## Responsive library and editor

- Below 1024px, the library sidebar moves into a navigation drawer. Its existing sections, profile menu and album controls are reused. Phone grids show two columns; photo actions on mobile appear after tapping a card and dismiss when tapping elsewhere. Album selection uses a portaled dialog so other cards cannot overlap it.
- The editor keeps its canvas and chat mounted when switching panels. Its tool rail becomes horizontal below the image, with a 28px profile avatar first and evenly spaced 24px tool icons that scroll together in one horizontal rail; All panels start closed on mobile; opening Chat or an adjustment section reveals it in the lower workspace. Closing a panel reveals more of the image. Desktop panel orientation is unchanged.
- The mobile toolbar uses one compact 56px row with back, zoom, before/after, undo/redo and icon-only export. Filename and save status are hidden; autosave continues normally. Free inspection supports one-finger pan and two-finger zoom; crop handles and painted selections remain under Fabric's control.
- `ViewportHeight` follows the visual viewport for keyboard-safe sizing, including body-portaled dialogs. While typing in mobile chat, the canvas and lower rail temporarily give their space to the conversation and composer. Sources, history, saving, credit costs and export resolution use the existing pipeline.
- Phone input text uses 16px to avoid automatic focus zoom. Existing fonts, colors, borders, slider appearance and button chrome are retained.

## Layout — settings

- First library visits show a four-step square introduction with step count, close button, back/next arrows and Finish. Closing (including Escape) or finishing records `reduxIntroductionDismissed` in the account's Clerk unsafe metadata. Accounts without that flag see it once, including existing accounts encountering the introduction for the first time. Settings → About → Introduction replays it without clearing completion. The dialog uses the existing dark surfaces and white modal CTA, traps focus and fits the smaller viewport dimension; the recording and compact text fit within the square without an internal scrollbar.
- Four thin blocks below the step count fill through the current step and clear later blocks when navigating back. Welcome centers the Redux logo above its heading and description with equal gaps; the other steps show separate supplied screen recordings for uploading, adjustments and downloading. Recordings match the full text width, with a 24px gap before concise headings and descriptions. Smaller text and navigation controls keep the layout open. Recordings have a thin border without decorative window headers. Each muted video autoplays inline and loops independently from start to finish. The recordings do not perform live actions.

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
| Toasts | One `AppToaster` in dashboard layout; bottom-right with safe-area spacing, shared popup fade and 8px rise, and shared styles in `lib/toast-styles.ts`; omit sentence punctuation in toast copy (including API messages) |
| Loading | `LoadingSpinner` / `LoadingOverlay` |
| Clerk auth UI | `ReduxClerkAuthShell`, `lib/redux-clerk-appearance.ts` |

## Border radii (convention)

- Side panels: `rounded-2xl`
- Modals/cards: `rounded-xl`
- Buttons/chips: `rounded-md`
- Inputs: `rounded-lg`
- Clerk buttons: ~6px radius (not pill)

## Popup motion

- All app-owned dialogs, menus, tooltips, date pickers, drawers and notifications use a 200ms ease-out fade with an 8px upward entrance, matching onboarding. Backdrops fade without moving.
- Framer Motion surfaces use `usePopupMotion` in `lib/popup-motion.ts`; CSS surfaces use `redux-popup-enter` and `redux-popup-backdrop` in `app/globals.css`. Both respect reduced motion. Keep these definitions synchronized.
- Existing Framer surfaces reverse the entrance on exit; conditionally mounted CSS surfaces dismiss immediately.

## Content motion

- Library and Settings main content and the editor canvas slot fade in over 200ms without moving page chrome or transforming the canvas.
- Settings sections, adjustment sections, and library view results use the shared 200ms fade and 8px rise. Content keys follow section/view changes, not slider values or individual photo mutations.
- Photo cards animate position changes over 200ms without scaling image content; favorite selection has a subtle 150ms feedback animation, and Settings/tool buttons have restrained press feedback.
- Reduced motion disables content entrances, grid movement, and press/selection effects. Canvas adjustments stay immediate. The upload box has no separate entrance or status transition, matching the greeting and search bar.

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

Mobile sliders retain their visible track and thumb sizes while expanding their touch hit area vertically. Chat mode/model menus stay within the visual viewport and reposition when the keyboard changes its size.

Browsers without working Canvas 2D filters use a pixel renderer for tonal/color filters and noise softening. Native filter settings are shared with the fallback; temperature/tint/hue, vignette, grain and alpha handling retain their existing pipeline. Effects sliders expose only supported ranges (sharpen/vignette/grain 0–100, noise reduction −100–0, clarity −100–100).
