import AdjustmentPanel from "@/components/editor/AdjustmentPanel";
import {
  ONBOARDING_ADJUSTMENTS_PANEL_WIDTH,
  ONBOARDING_PREVIEW_HEIGHT,
  ONBOARDING_PREVIEW_WIDTH,
} from "@/components/onboarding/onboarding-preview-canvas";
import { ONBOARDING_SAMPLE_IMAGE_URL } from "@/components/onboarding/onboarding-preview-data";
import OnboardingPreviewRoot from "@/components/onboarding/previews/OnboardingPreviewRoot";
import { DEFAULT_ADJUSTMENTS } from "@/constants/adjustments";

/** Scale panel mock to fill the standard artboard width (same outer frame as other steps). */
const ADJUSTMENTS_SHOWCASE_SCALE =
  ONBOARDING_PREVIEW_WIDTH / ONBOARDING_ADJUSTMENTS_PANEL_WIDTH;

export default function OnboardingAdjustmentsPreview() {
  return (
    <OnboardingPreviewRoot className="relative overflow-hidden bg-[#121212]">
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute left-0 top-0 origin-top-left overflow-hidden bg-[#121212]"
          style={{
            width: ONBOARDING_ADJUSTMENTS_PANEL_WIDTH,
            height: ONBOARDING_PREVIEW_HEIGHT,
            transform: `scale(${ADJUSTMENTS_SHOWCASE_SCALE})`,
          }}
        >
          <AdjustmentPanel
            showcaseMode
            initialActiveSection="light"
            adjustments={DEFAULT_ADJUSTMENTS}
            onPreview={() => {}}
            onCommit={() => {}}
            imageUrl={ONBOARDING_SAMPLE_IMAGE_URL}
            imageWidth={1600}
            imageHeight={1067}
            canvasImageUrl={ONBOARDING_SAMPLE_IMAGE_URL}
          />
        </div>
      </div>
    </OnboardingPreviewRoot>
  );
}
