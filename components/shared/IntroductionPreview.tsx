import { appPath } from "@/lib/app-path";
import { SURFACE_POPOVER } from "@/lib/surface-colors";

const PREVIEWS = [
  { src: "/videos/introduction/uploading.mp4", description: "Uploading a photo to the library" },
  { src: "/videos/introduction/adjustments.mp4", description: "Adjusting a photo in the editor" },
  { src: "/videos/introduction/downloads.mp4", description: "Downloading the finished photo" },
];

/** Recorded demonstrations only; each step repeats its own clip. */
export default function IntroductionPreview({ step }: { step: number }) {
  const preview = PREVIEWS[step - 1];
  if (!preview) return null;

  return (
    <div className={`${SURFACE_POPOVER} mb-6 w-full min-h-0 overflow-hidden rounded-lg border border-[#2e2e2e]`}>
      <video
        key={preview.src}
        src={appPath(preview.src)}
        aria-label={preview.description}
        autoPlay
        loop
        muted
        playsInline
        width={3024}
        height={1700}
        className="block h-auto w-full"
      />
    </div>
  );
}
