"use client";

import Image from "next/image";

import OnboardingShowcaseUsageRing from "@/components/onboarding/previews/OnboardingShowcaseUsageRing";
import { Icon } from "@/components/shared/Icon";
import {
  CHAT_SEND_BTN_DISABLED,
  CHAT_TOOLBAR_CHIP,
} from "@/lib/panel-chrome";
import { SURFACE_BORDER } from "@/lib/surface-colors";

const TOOLBAR_CHIP_H = "h-7";
const LOGO_PX = 40;

/** Bento-style chat input — compact for onboarding (redux-web bento, shorter + wider). */
export default function OnboardingShowcaseChatInput({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={[
        "overflow-hidden rounded-lg bg-[#1d1d1d]",
        className,
      ].join(" ")}
      aria-hidden
    >
      <div className="flex min-h-[56px] items-start px-3 pb-2 pt-2.5">
        <div className="flex w-full min-w-0 items-center gap-2.5 overflow-hidden">
          <Image
            src="/r-logo.png"
            alt=""
            width={LOGO_PX}
            height={LOGO_PX}
            className="size-10 shrink-0 -translate-y-0.5 rounded"
            aria-hidden
          />
          <textarea
            readOnly
            tabIndex={-1}
            rows={1}
            placeholder="Describe the edit you want..."
            className="pointer-events-none min-h-[20px] w-full min-w-0 resize-none bg-transparent pt-0 text-[14px] font-normal leading-snug text-white outline-none placeholder:text-[#666666]"
          />
        </div>
      </div>

      <div
        className={`flex items-center justify-between gap-2 border-t ${SURFACE_BORDER} px-3 pb-2 pt-2`}
      >
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          <div
            className={`${CHAT_TOOLBAR_CHIP} flex ${TOOLBAR_CHIP_H} w-7 items-center justify-center opacity-50`}
          >
            <Icon name="Paperclip" size={16} aria-hidden />
          </div>

          <div
            className={`${CHAT_TOOLBAR_CHIP} flex ${TOOLBAR_CHIP_H} cursor-default items-center gap-0.5 px-1.5`}
          >
            <span className="truncate whitespace-nowrap text-[11px] font-semibold text-[#888888]">
              Claude Sonnet 4.5
            </span>
            <Icon name="ChevronDown" size={16} className="text-[#888888]" aria-hidden />
          </div>

          <div className="scale-90 origin-center">
            <OnboardingShowcaseUsageRing />
          </div>
        </div>

        <button
          type="button"
          title="Send"
          tabIndex={-1}
          aria-disabled
          className={`${CHAT_SEND_BTN_DISABLED} !h-6 !w-6`}
        >
          <Icon name="Send01" size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
