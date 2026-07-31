import type { DefaultToastOptions } from "react-hot-toast";

import {
  PRIMARY_BRAND_HEX,
  PRIMARY_BRAND_RGB,
} from "@/lib/brand-colors";

/** Matches --shadow-btn-primary in app/globals.css */
export const TOAST_BOX_SHADOW =
  `0 0 0 2px rgba(255, 255, 255, 0.12), 0 4px 24px rgba(${PRIMARY_BRAND_RGB}, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.25)`;

export const TOAST_SHELL_CLASS =
  "rounded-xl border border-white/20 bg-[#794ADE] shadow-btn-primary text-[13px] font-medium text-white py-2.5 px-4";

export const TOAST_INLINE_STYLE = {
  background: PRIMARY_BRAND_HEX,
  color: "#ffffff",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  borderRadius: "12px",
  fontSize: "13px",
  fontWeight: 500,
  padding: "10px 16px",
  boxShadow: TOAST_BOX_SHADOW,
} as const;

const iconTheme = {
  primary: "#ffffff",
  secondary: PRIMARY_BRAND_HEX,
} as const;

const sharedToastOptions = {
  className: TOAST_SHELL_CLASS,
  style: TOAST_INLINE_STYLE,
  iconTheme,
} as const;

export const defaultToastOptions: DefaultToastOptions = {
  duration: 3000,
  ...sharedToastOptions,
  success: sharedToastOptions,
  error: sharedToastOptions,
};
