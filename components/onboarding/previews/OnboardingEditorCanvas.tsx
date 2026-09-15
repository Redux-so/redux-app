import { ONBOARDING_SAMPLE_IMAGE_URL } from "@/components/onboarding/onboarding-preview-data";

/** Static canvas stand-in — matches `Canvas.tsx` (flex area + centered fit). */
export default function OnboardingEditorCanvas({
  dimmed = false,
}: {
  dimmed?: boolean;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#161616] p-8">
      <div className="relative min-h-0 flex-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ONBOARDING_SAMPLE_IMAGE_URL}
          alt=""
          draggable={false}
          aria-hidden
          className={[
            "absolute left-1/2 top-1/2 max-h-[95%] max-w-[95%] -translate-x-1/2 -translate-y-1/2 object-contain",
            dimmed ? "opacity-40" : "",
          ].join(" ")}
        />
      </div>
    </div>
  );
}
