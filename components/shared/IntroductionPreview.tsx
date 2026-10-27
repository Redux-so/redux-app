import Image from "next/image";
import photo from "@/assets/brand/auth-hero.jpg";
import { Icon } from "@/components/shared/Icon";
import { SURFACE_POPOVER } from "@/lib/surface-colors";

const DESCRIPTIONS = [
  "Example library with an upload area, a photo and an album",
  "Example editor with light adjustments and an Agent chat editing request",
  "Example saved photo with version history and JPEG export",
];

/** Illustrative UI only: these previews never upload, edit, export or spend credits. */
export default function IntroductionPreview({ step }: { step: number }) {
  return (
    <div role="img" aria-label={DESCRIPTIONS[step - 1]} className={`${SURFACE_POPOVER} mb-5 shrink-0 overflow-hidden rounded-lg`}>
      <div aria-hidden>
        <div className="flex h-7 items-center gap-1.5 border-b border-[#212121] bg-[#161616] px-3">
          <span className="h-1 w-1 rounded-full bg-[#555555]" />
          <span className="h-1 w-1 rounded-full bg-[#555555]" />
          <span className="h-1 w-1 rounded-full bg-[#555555]" />
          <span className="ml-2 text-[9px] text-[#888888]">{["Library", "Editor", "Export"][step - 1]}</span>
        </div>
        <div className="grid h-[120px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 p-3 sm:h-[140px]">
          <div className="relative min-h-0 overflow-hidden rounded bg-[#1d1d1d]">
            <Image src={photo} alt="" fill sizes="180px" className="object-cover object-[center_65%]" />
            {step === 1 && <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[9px] text-white">Fuji.jpg</span>}
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-2 text-[10px] text-[#888888]">
            {step === 1 ? (
              <>
                <div className="flex flex-1 items-center justify-center gap-2 rounded-md border border-dashed border-[#333333] px-2">
                  <Icon name="Plus" size={16} />
                  <span>Upload photos</span>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-[#1d1d1d] p-2">
                  <Icon name="Folder" size={16} />
                  <span>Japan trip</span>
                </div>
              </>
            ) : step === 2 ? (
              <>
                <div className="flex justify-between gap-2"><span>Exposure</span><span>+15</span></div>
                <div className="relative h-0.5 rounded-full bg-[#333333]">
                  <div className="h-full w-3/5 rounded-full bg-[#888888]" />
                  <span className="absolute -top-1 left-3/5 h-2.5 w-2.5 rounded-full bg-[#ededed]" />
                </div>
                <div className="mt-1 rounded-md border border-[#262626] bg-[#1d1d1d] p-2">
                  <span className="text-[9px] text-white">Agent</span>
                  <p className="mt-1 leading-snug">Brighten the photo and lift the shadows</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5"><Icon name="Check" size={16} /><span>Saved</span></div>
                <div className="flex items-center gap-1.5"><Icon name="ClockRewind" size={16} /><span>History</span></div>
                <div className="flex items-center justify-between rounded-md border border-[#262626] px-2 py-1.5"><span>Format</span><span className="text-white">JPEG</span></div>
                <div className="flex items-center justify-center gap-1.5 rounded-md bg-[#ededed] py-1.5 text-[#2a2a2a]">
                  <Icon name="Download01" size={16} /><span>Export photo</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
