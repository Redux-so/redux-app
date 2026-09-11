import type { DefaultToastOptions } from "react-hot-toast";

import { BRAND_CTA_CLASS } from "@/lib/brand-colors";
import { BTN_BRAND_TYPE } from "@/lib/button-styles";

/** Toast shell — same chrome + label as BTN_BRAND_SOLID (globals.css enforces over goober defaults). */
export const TOAST_SHELL_CLASS = [
  BRAND_CTA_CLASS,
  "redux-toast",
  "inline-flex items-center gap-1.5 min-h-8 px-3.5 py-2",
  BTN_BRAND_TYPE,
  "max-w-[320px] whitespace-pre-wrap break-words",
].join(" ");

/** Neutralize react-hot-toast inline defaults; pill chrome lives in CSS. */
const toastStyle = {
  background: "transparent",
  color: "inherit",
  boxShadow: "none",
  borderRadius: 0,
  padding: 0,
  maxWidth: "none",
} as const;

const sharedToastOptions = {
  className: TOAST_SHELL_CLASS,
  style: toastStyle,
  icon: null,
} as const;

export const defaultToastOptions: DefaultToastOptions = {
  duration: 3000,
  ...sharedToastOptions,
  success: sharedToastOptions,
  error: sharedToastOptions,
};
