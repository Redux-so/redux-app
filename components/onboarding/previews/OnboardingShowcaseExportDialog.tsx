"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";

import { Icon } from "@/components/shared/Icon";
import { BTN_BRAND_SOLID } from "@/lib/button-styles";

const SHOWCASE_QUALITY = 90;
const SHOWCASE_ESTIMATED_SIZE = "~1.6 MB";

const FORMAT_SELECTED =
  "inline-flex flex-1 items-center justify-center h-7 min-h-7 rounded-md border border-[#ffffff]/10 bg-[#ededed] px-2 text-[11px] font-medium leading-none text-[#2a2a2a] select-none";

const FORMAT_IDLE =
  "inline-flex flex-1 items-center justify-center h-7 min-h-7 rounded-md border border-[#262626] bg-[#1d1d1d] px-2 text-[11px] font-medium text-white/80 select-none opacity-90";

/** Compact export dialog — visual scale aligned with OnboardingShowcaseChatInput. */
export default function OnboardingShowcaseExportDialog({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={["w-full overflow-hidden rounded-lg bg-[#121212] p-3", className].join(" ")}
      role="presentation"
      aria-hidden
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-medium leading-tight text-white">Export Image</h2>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#888888]">
          <Icon name="XClose" size={16} aria-hidden />
        </span>
      </div>

      <div className="flex flex-col gap-2.5 rounded-lg border border-[#262626] bg-[#1d1d1d] p-2.5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-[#888888]">Format</span>
          <div className="flex gap-1.5">
            <span className={FORMAT_SELECTED}>JPEG</span>
            <span className={FORMAT_IDLE}>PNG</span>
            <span className={FORMAT_IDLE}>TIFF</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#888888]">Quality</span>
            <span className="text-[12px] tabular-nums text-[#888888]">{SHOWCASE_QUALITY}</span>
          </div>
          <SliderPrimitive.Root
            min={1}
            max={100}
            step={1}
            value={[SHOWCASE_QUALITY]}
            disabled
            className="relative flex w-full touch-none select-none items-center opacity-90"
          >
            <SliderPrimitive.Track className="relative h-[2px] w-full grow rounded-full bg-white/[0.08]">
              <SliderPrimitive.Range className="absolute h-full rounded-full bg-neutral-400" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb className="block h-[10px] w-[10px] rounded-full bg-[#e5e5e5] shadow-[0_0_0_1px_rgba(255,255,255,0.15)] outline-none" />
          </SliderPrimitive.Root>
          <span className="text-[11px] text-[#555555]">
            Estimated size: {SHOWCASE_ESTIMATED_SIZE}
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex justify-end">
        <span
          className={`${BTN_BRAND_SOLID} pointer-events-none !h-7 gap-1 !px-3 text-[12px] [&_svg]:!size-3.5`}
        >
          <Icon name="Download01" size={16} strokeWidth={2} aria-hidden />
          Download
        </span>
      </div>
    </div>
  );
}
