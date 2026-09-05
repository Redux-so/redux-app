/** App-wide surface color tokens (Library page system). */

export const SURFACE_MAIN_HEX = "#161616";
export const SURFACE_PANEL_HEX = "#121212";
export const SURFACE_RAISED_HEX = "#1d1d1d";
export const SURFACE_BORDER_HEX = "#282828";
export const SURFACE_BORDER_FOCUS_HEX = "#333333";

export const SURFACE_BG_MAIN = "bg-[#161616]";
export const SURFACE_BG_PANEL = "bg-[#121212]";
export const SURFACE_BG_RAISED = "bg-[#1d1d1d]";

export const SURFACE_BORDER = "border-[#282828]";
export const SURFACE_BORDER_FOCUS = "border-[#333333]";

/** Search bars, text fields, dropzones. */
export const SURFACE_INPUT =
  "border border-solid border-[#282828] bg-[#1d1d1d] outline-none transition-colors focus:border-[#333333] hover:border-[#333333]";

/** Modals, popovers, dropdown panels. */
export const SURFACE_POPOVER =
  "bg-[#121212] border border-[#282828]";

/** Nav / list row — default + hover. */
export const SURFACE_BTN_ROW =
  "border transition-colors cursor-pointer outline-none focus:outline-none";

export const SURFACE_BTN_IDLE =
  "border-[#121212] text-[#888888] hover:bg-[#1d1d1d] hover:text-white";

/** Nav rows on `#161616` main background (border blends into page). */
export const SURFACE_BTN_IDLE_ON_MAIN =
  "border-[#161616] text-[#888888] hover:bg-[#1d1d1d] hover:text-white";

export const SURFACE_BTN_ACTIVE =
  "bg-[#1d1d1d] !border-[#282828] text-white";

/** Icon-sized control on a panel. */
export const SURFACE_ICON_BTN =
  "flex shrink-0 items-center justify-center rounded-md border border-[#121212] text-[#888888] transition-colors cursor-pointer outline-none focus:outline-none hover:bg-[#1d1d1d] hover:text-white";

/** Ghost button on a panel (settings, dialogs). */
export const SURFACE_GHOST_BTN =
  "border border-[#282828] text-[#888888] hover:bg-[#1d1d1d] hover:text-white transition-colors cursor-pointer";

/** Secondary action button inside adjustment/editor panels. */
export const SURFACE_SECONDARY_BTN =
  "border border-[#282828] bg-[#1d1d1d] text-white hover:bg-[#1d1d1d] hover:border-[#333333] transition-colors cursor-pointer";

/** Decorative empty-state icons — brand purple accent. */
export { EMPTY_STATE_ICON_CLASS } from "@/lib/brand-colors";
