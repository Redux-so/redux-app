import { SURFACE_SECONDARY_BTN } from "@/lib/surface-colors";
import { BTN_BRAND_VISUAL } from "@/lib/brand-colors";

/** Dark grey for soft-white CTA label + icons (single source of truth). */
export const BTN_SOFT_FG_HEX = "#2a2a2a";

export const BTN_SOFT_FG =
  "text-[#2a2a2a] [&_svg]:text-[#2a2a2a] [&_svg]:stroke-current";

/** Soft white CTA label + icons — dark grey on light button chrome */
export const BTN_PRIMARY_TYPE =
  `text-[13px] font-medium leading-none ${BTN_SOFT_FG}`;

/** Brand CTA label + icon weight — white on blue chrome (matches redux-web pill CTAs). */
export const BTN_BRAND_TYPE =
  "text-[13px] font-medium text-white leading-none [&_svg]:shrink-0 [&_svg]:!size-4 [&_svg]:stroke-[2]";

/** Soft white CTA shell — muted vs pure white on dark chrome */
export const BTN_MODAL_VISUAL =
  "rounded-md border border-[#ffffff]/10 bg-[#ededed] shadow-none transition-[background-color,transform] duration-200 hover:bg-[#e0e0e0] active:scale-[0.98] active:bg-[#d4d4d4] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";

/** Standalone CTA — header, toolbar, modal footers (matches h-9 chrome controls) */
export const BTN_PRIMARY_SOLID = [
  "inline-flex items-center justify-center gap-1.5 h-9 px-4 whitespace-nowrap cursor-pointer select-none",
  BTN_PRIMARY_TYPE,
  BTN_MODAL_VISUAL,
].join(" ");

/** Compact CTA — pairs with h-8 secondary buttons (e.g. chat changes bar) */
export const BTN_PRIMARY_COMPACT = [
  "inline-flex items-center justify-center h-8 px-3.5 whitespace-nowrap cursor-pointer select-none",
  "text-[12px] font-semibold leading-none",
  BTN_SOFT_FG,
  BTN_MODAL_VISUAL,
].join(" ");

/** Panel row CTA — pairs with h-[34px] ghost Cancel buttons */
export const BTN_PRIMARY_PANEL = [
  "inline-flex flex-1 items-center justify-center gap-1.5 h-[34px] px-4 min-w-0 cursor-pointer select-none",
  BTN_PRIMARY_TYPE,
  BTN_MODAL_VISUAL,
].join(" ");

/** Modal primary label — alias of primary type */
export const BTN_MODAL_TYPE = BTN_PRIMARY_TYPE;

/** Modal footer / row primary — Credit Shop price buttons */
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
  BTN_MODAL_VISUAL,
].join(" ");

/** Compact icon-only primary — default white (use BTN_BRAND_ICON for brand CTA) */
export const BTN_PRIMARY_ICON = [
  "inline-flex shrink-0 items-center justify-center w-8 h-8 cursor-pointer select-none",
  BTN_PRIMARY_TYPE,
  BTN_MODAL_VISUAL,
].join(" ");

/** Segmented control — selected format tab */
export const BTN_FORMAT_SELECTED = [
  "flex flex-1 items-center justify-center h-9 px-3 cursor-pointer select-none",
  BTN_PRIMARY_TYPE,
  BTN_MODAL_VISUAL,
].join(" ");

/** Brand CTA standalone button */
export const BTN_BRAND_SOLID = [
  "inline-flex items-center justify-center gap-1.5 h-8 px-3.5 whitespace-nowrap cursor-pointer select-none",
  BTN_BRAND_TYPE,
  BTN_BRAND_VISUAL,
].join(" ");

/** Brand CTA panel row button */
export const BTN_BRAND_PANEL = [
  "inline-flex flex-1 items-center justify-center gap-1.5 h-8 px-3.5 min-w-0 cursor-pointer select-none",
  BTN_BRAND_TYPE,
  BTN_BRAND_VISUAL,
].join(" ");

/** Brand CTA full-width panel button */
export const BTN_BRAND_BLOCK = [
  "inline-flex w-full items-center justify-center gap-1.5 h-8 px-3.5 cursor-pointer select-none",
  BTN_BRAND_TYPE,
  BTN_BRAND_VISUAL,
].join(" ");

/** Brand CTA compact icon-only (chat send) */
export const BTN_BRAND_ICON = [
  "inline-flex shrink-0 items-center justify-center w-7 h-7 cursor-pointer select-none",
  BTN_BRAND_TYPE,
  BTN_BRAND_VISUAL,
].join(" ");

export const BTN_FORMAT_IDLE =
  `flex flex-1 items-center justify-center h-9 px-3 rounded-md text-[13px] font-medium text-white/80 ${SURFACE_SECONDARY_BTN} select-none`;
