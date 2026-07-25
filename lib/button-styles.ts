import { SURFACE_SECONDARY_BTN } from "@/lib/surface-colors";
export const BTN_PRIMARY_TYPE =
  "text-[13px] font-medium text-white leading-none";

/** Shared primary CTA shell — bg, border, radius, shadows, hover/active */
const BTN_PRIMARY_VISUAL =
  "rounded-md border border-white/20 bg-[#8758ed] shadow-btn-primary transition-[background-color,box-shadow,transform] duration-200 hover:bg-[#9a6ff2] hover:shadow-btn-primary-hover active:scale-[0.98] active:shadow-btn-primary-active disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";

/** Standalone CTA — header, toolbar, modal footers (matches h-9 chrome controls) */
export const BTN_PRIMARY_SOLID = [
  "inline-flex items-center justify-center gap-1.5 h-9 px-4 whitespace-nowrap cursor-pointer select-none",
  BTN_PRIMARY_TYPE,
  BTN_PRIMARY_VISUAL,
].join(" ");

/** Panel row CTA — pairs with h-[34px] ghost Cancel buttons */
export const BTN_PRIMARY_PANEL = [
  "inline-flex flex-1 items-center justify-center gap-1.5 h-[34px] px-4 min-w-0 cursor-pointer select-none",
  BTN_PRIMARY_TYPE,
  BTN_PRIMARY_VISUAL,
].join(" ");

/** Modal primary label — dark text on white CTA */
export const BTN_MODAL_TYPE =
  "text-[13px] font-medium text-[#161616] leading-none";

/** White modal CTA shell — no purple glow */
const BTN_MODAL_VISUAL =
  "rounded-md border border-white/15 bg-white shadow-none transition-[background-color,transform] duration-200 hover:bg-[#e5e5e5] active:scale-[0.98] active:bg-[#d4d4d4] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";

/** Modal footer / row primary — Export, Upload, Credit Shop, Clerk UserProfile */
export const BTN_MODAL_SOLID = [
  "inline-flex items-center justify-center gap-1.5 h-9 px-4 whitespace-nowrap cursor-pointer select-none",
  BTN_MODAL_TYPE,
  BTN_MODAL_VISUAL,
].join(" ");

/** Modal panel row primary — pairs with ghost Cancel in dialog footers */
export const BTN_MODAL_PANEL = [
  "inline-flex flex-1 items-center justify-center gap-1.5 h-[34px] px-4 min-w-0 cursor-pointer select-none",
  BTN_MODAL_TYPE,
  BTN_MODAL_VISUAL,
].join(" ");

/** Segmented control — selected format tab inside modals */
export const BTN_MODAL_FORMAT_SELECTED = [
  "flex flex-1 items-center justify-center h-9 px-3 cursor-pointer select-none",
  BTN_MODAL_TYPE,
  BTN_MODAL_VISUAL,
].join(" ");

/** Full-width panel CTA */
export const BTN_PRIMARY_BLOCK = [
  "inline-flex w-full items-center justify-center gap-1.5 h-[34px] px-4 cursor-pointer select-none",
  BTN_PRIMARY_TYPE,
  BTN_PRIMARY_VISUAL,
].join(" ");

/** Compact icon-only primary (chat send) */
export const BTN_PRIMARY_ICON = [
  "inline-flex shrink-0 items-center justify-center w-8 h-8 cursor-pointer select-none",
  BTN_PRIMARY_TYPE,
  BTN_PRIMARY_VISUAL,
].join(" ");

/** Segmented control — selected format tab */
export const BTN_FORMAT_SELECTED = [
  "flex flex-1 items-center justify-center h-9 px-3 cursor-pointer select-none",
  BTN_PRIMARY_TYPE,
  BTN_PRIMARY_VISUAL,
].join(" ");

export const BTN_FORMAT_IDLE =
  `flex flex-1 items-center justify-center h-9 px-3 rounded-md text-[13px] font-medium text-white/80 ${SURFACE_SECONDARY_BTN} select-none`;
