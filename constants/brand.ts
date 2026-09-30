import type { StaticImageData } from "next/image";

import reduxMark from "@/assets/brand/redux-mark.png";

/** Bundled logo — content hash updates when the PNG changes (avoids stale `/logo.png` cache). */
export const BRAND_LOGO_IMAGE: StaticImageData = reduxMark;

/** Same artwork at a stable URL (Open Graph, etc.). */
export const BRAND_LOGO_PUBLIC_PATH = "/logo.png";

/** Site favicon (see scripts/process-favicons.mjs). */
export const FAVICON_PATH = "/favicon.png";
export const APPLE_TOUCH_ICON_PATH = "/apple-touch-icon.png";
