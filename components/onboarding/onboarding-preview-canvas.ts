/** Shared artboard size for all product-tour UI previews (scale via OnboardingScaledFrame). */
export const ONBOARDING_PREVIEW_WIDTH = 920;
export const ONBOARDING_PREVIEW_HEIGHT = 560;

/** Tool rail (72) + adjustment panel (360) — natural width before in-frame scale-up. */
export const ONBOARDING_ADJUSTMENTS_PANEL_WIDTH = 432;

export const ONBOARDING_PREVIEW_CANVAS_CLASS =
  "min-h-0 overflow-hidden bg-[#161616]";

/**
 * Caps preview width to the lg two-column left pane (11/24 of the dialog), even when
 * the modal stacks to one column — keeps scale consistent as the window resizes.
 * Dialog: max-w 880px, outer p-4; left pane lg:p-6.
 */
export const ONBOARDING_PREVIEW_FRAME_MAX_WIDTH_CLASS =
  "mx-auto w-full max-w-[calc((min(100vw-2rem,880px)*11/24)-4.5rem)]";

/** Thin 1px frame — fills the preview column (scaled UI steps). */
export const ONBOARDING_PREVIEW_BORDER_SHELL_CLASS =
  "flex w-full min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-lg border border-[#262626]";

/** Same border, hugging chat/export showcase height (no vertical stretch). */
export const ONBOARDING_PREVIEW_BORDER_SHELL_COMPACT_CLASS =
  "w-full max-w-[min(100%,34rem)] shrink-0 overflow-hidden rounded-lg border border-[#262626]";
