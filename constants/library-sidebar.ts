/** Library left panel width — keep sidebar shell and profile popover in sync. */
export const LIBRARY_SIDEBAR_WIDTH_PX = 260;

/** Horizontal padding on the sidebar footer (matches Tailwind `px-4`). */
export const LIBRARY_SIDEBAR_FOOTER_PADDING_X_PX = 16;

/** Footer content width (sidebar minus horizontal padding). */
export const LIBRARY_SIDEBAR_CONTENT_WIDTH_PX =
  LIBRARY_SIDEBAR_WIDTH_PX - LIBRARY_SIDEBAR_FOOTER_PADDING_X_PX * 2;

/** Profile popover — inset from content edges so it clears overflow-hidden clip. */
export const LIBRARY_PROFILE_POPOVER_WIDTH_PX =
  LIBRARY_SIDEBAR_CONTENT_WIDTH_PX - 8;
