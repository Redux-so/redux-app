/** Primary brand blue — CTAs, toasts, Clerk auth, links, accents. */

export const PRIMARY_BRAND_HEX = "#3A6FFF";
export const PRIMARY_BRAND_HOVER_HEX = "#5285FF";

/** Lighter tints for links on dark backgrounds. */
export const PRIMARY_BRAND_LINK_HEX = "#7CA8FF";
export const PRIMARY_BRAND_LINK_HOVER_HEX = "#96BBFF";

/** RGB tuple for rgba() shadows and glows. */
export const PRIMARY_BRAND_RGB = "58, 111, 255";

/** User chat bubble — brand blue, slightly darker than primary CTA (#3A6FFF). */
export const CHAT_USER_BUBBLE_BG_HEX = "#2E55CC";

/** Tailwind class fragments (static strings for JIT). */
export const BRAND_BG_CLASS = "bg-[#3A6FFF]";
export const BRAND_BG_HOVER_CLASS = "hover:bg-[#5285FF]";
export const BRAND_TEXT_CLASS = "text-[#3A6FFF]";
export const BRAND_TEXT_HOVER_CLASS = "hover:text-[#5285FF]";
export const BRAND_LINK_TEXT_CLASS = "text-[#7CA8FF]";
export const BRAND_LINK_TEXT_HOVER_CLASS = "hover:text-[#96BBFF]";
export const BRAND_BORDER_CLASS = "border-[#3A6FFF]";
export const BRAND_FOCUS_RING_CLASS = "focus:border-[#3A6FFF]/60";
export const BRAND_ACCENT_CLASS = "accent-[#3A6FFF]";

export const EMPTY_STATE_ICON_CLASS = "text-[#3A6FFF]";

/** Brand CTA shell — credit/auth/chat-send exceptions only. */
export const BTN_BRAND_VISUAL = [
  "rounded-md border border-white/20 bg-[#3A6FFF] shadow-btn-primary",
  "transition-[background-color,box-shadow,transform] duration-200",
  "hover:bg-[#5285FF] hover:shadow-btn-primary-hover",
  "active:scale-[0.98] active:shadow-btn-primary-active",
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
].join(" ");

/** Clerk / auth primary button (full class string). */
export const AUTH_PRIMARY_BTN_CLASS = [
  "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-white/20",
  "bg-[#3A6FFF] text-[13px] font-semibold leading-none text-white shadow-btn-primary",
  "transition-[background-color,box-shadow] duration-200",
  "hover:bg-[#5285FF] hover:shadow-btn-primary-hover active:shadow-btn-primary-active",
  "disabled:opacity-40 disabled:cursor-not-allowed",
].join(" ");

export const CHAT_USER_BUBBLE_CLASS =
  "rounded-xl bg-[#2E55CC] text-[13px] font-medium text-white py-2.5 px-4";

export const LIBRARY_CHOICE_SELECTED_CLASS = "border-[#3A6FFF] bg-[#3A6FFF]";
