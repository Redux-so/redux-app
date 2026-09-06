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
