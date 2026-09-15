/** Shared editor side-panel header chrome (adjustment section + chat). */

import { SURFACE_BORDER } from "@/lib/surface-colors";

/** Header row — fixed height with bottom divider. */
export const PANEL_HEADER =
  `flex items-center shrink-0 h-12 border-b ${SURFACE_BORDER}`;

/** Section title label (Chat, Light, Color, …). */
export const PANEL_TITLE =
  "text-[14px] font-semibold text-white select-none";

/** Portaled popovers from the chat footer — matches input/toolbar surfaces. */
export const CHAT_POPOVER_CHROME = `border ${SURFACE_BORDER} bg-[#1d1d1d]`;

/** Toolbar chip shell in chat input footer (matches redux-web marketing showcase). */
export const CHAT_TOOLBAR_CHIP =
  "rounded-md border border-[#262626] bg-[#1d1d1d] shadow-[0_1px_2px_rgba(0,0,0,0.26),0_2px_5px_rgba(0,0,0,0.12)]";

/** Send button when input is empty/disabled. */
export const CHAT_SEND_BTN_DISABLED =
  "pointer-events-none shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.08] text-[#666666] opacity-50 cursor-not-allowed";
