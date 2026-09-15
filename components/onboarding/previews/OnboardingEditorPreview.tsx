import Toolbar from "@/components/editor/Toolbar";
import OnboardingEditorCanvas from "@/components/onboarding/previews/OnboardingEditorCanvas";
import OnboardingEditorCanvasRegion from "@/components/onboarding/previews/OnboardingEditorCanvasRegion";
import OnboardingPreviewRoot from "@/components/onboarding/previews/OnboardingPreviewRoot";
import { ONBOARDING_TOOLBAR_PROPS } from "@/components/onboarding/previews/onboarding-toolbar-props";

export default function OnboardingEditorPreview() {
  return (
    <OnboardingPreviewRoot className="flex min-h-0 flex-col overflow-hidden">
      <Toolbar {...ONBOARDING_TOOLBAR_PROPS} />
      <OnboardingEditorCanvasRegion>
        <OnboardingEditorCanvas />
      </OnboardingEditorCanvasRegion>
    </OnboardingPreviewRoot>
  );
}
