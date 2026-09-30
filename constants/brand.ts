import type { StaticImageData } from "next/image";

import reduxMark from "@/assets/brand/redux-mark.png";

/** Bundled logo — content hash updates when the PNG changes (avoids stale `/logo.png` cache). */
export const BRAND_LOGO_IMAGE: StaticImageData = reduxMark;

/** Same artwork at a stable URL (favicons, Open Graph, etc.). */
export const BRAND_LOGO_PUBLIC_PATH = "/logo.png";
