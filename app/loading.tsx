import { LoadingOverlay } from "@/components/shared/LoadingSpinner";
import { SURFACE_BG_MAIN } from "@/lib/surface-colors";

export default function Loading() {
  return <LoadingOverlay className={`min-h-dvh w-full flex-1 ${SURFACE_BG_MAIN}`} />;
}
