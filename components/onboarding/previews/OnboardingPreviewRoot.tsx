import type { ReactNode } from "react";

import {
  ONBOARDING_PREVIEW_CANVAS_CLASS,
  ONBOARDING_PREVIEW_HEIGHT,
  ONBOARDING_PREVIEW_WIDTH,
} from "@/components/onboarding/onboarding-preview-canvas";

export default function OnboardingPreviewRoot({
  children,
  className = "",
  designWidth = ONBOARDING_PREVIEW_WIDTH,
  designHeight = ONBOARDING_PREVIEW_HEIGHT,
}: {
  children: ReactNode;
  className?: string;
  designWidth?: number;
  designHeight?: number;
}) {
  return (
    <div
      className={`${ONBOARDING_PREVIEW_CANVAS_CLASS} ${className}`.trim()}
      style={{ width: designWidth, height: designHeight }}
    >
      {children}
    </div>
  );
}
