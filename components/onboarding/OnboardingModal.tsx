"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

import { Icon } from "@/components/shared/Icon";
import {
  ONBOARDING_PREVIEW_BORDER_SHELL_CLASS,
  ONBOARDING_PREVIEW_BORDER_SHELL_COMPACT_CLASS,
  ONBOARDING_PREVIEW_FRAME_MAX_WIDTH_CLASS,
  ONBOARDING_PREVIEW_HEIGHT,
  ONBOARDING_PREVIEW_WIDTH,
} from "@/components/onboarding/onboarding-preview-canvas";
import { ONBOARDING_STEPS } from "@/components/onboarding/onboarding-steps";
import OnboardingScaledFrame from "@/components/onboarding/previews/OnboardingScaledFrame";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import {
  EXTERNAL_LINK_PROPS,
} from "@/constants/support";
import { BTN_FORMAT_IDLE, BTN_MODAL_FORMAT_SELECTED } from "@/lib/button-styles";
import {
  BRAND_CTA_CLASS,
  BRAND_LINK_TEXT_CLASS,
  BRAND_LINK_TEXT_HOVER_CLASS,
} from "@/lib/brand-colors";

/** Footer actions — `.onboarding-footer-btn` in globals.css locks 36px height for all variants. */
const ONBOARDING_FOOTER_BTN =
  "onboarding-footer-btn inline-flex shrink-0 items-center justify-center px-4 text-[14px] font-medium leading-none whitespace-nowrap cursor-pointer select-none rounded-md";

const BTN_GHOST = [
  ONBOARDING_FOOTER_BTN,
  "text-[#888888] border border-[#212121] hover:bg-[#1d1d1d] hover:text-white transition-colors",
].join(" ");

const BTN_PRIMARY = [
  ONBOARDING_FOOTER_BTN,
  "text-white",
  BRAND_CTA_CLASS,
].join(" ");

const TOTAL = ONBOARDING_STEPS.length;

export default function OnboardingModal() {
  const titleId = useId();
  const { isOpen, stepIndex, closeTour, completeAndClose, setStepIndex, goNext, goBack } =
    useOnboarding();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeTour();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeTour]);

  const step = ONBOARDING_STEPS[stepIndex];
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= TOTAL - 1;
  const Preview = step?.Preview;
  const isShowcaseCrop = step?.id === "chat" || step?.id === "credits";

  async function handlePrimary() {
    if (isLast) {
      await completeAndClose();
    } else {
      goNext();
    }
  }

  const modal = (
    <AnimatePresence>
      {isOpen && step && Preview && (
        <>
          <motion.div
            key="onboarding-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[80] bg-black/60"
            onClick={() => closeTour()}
          />
          <motion.div
            key="onboarding-modal"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-none p-4"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="pointer-events-auto grid w-full max-w-[880px] max-h-[calc(100vh-2rem)] overflow-hidden rounded-xl border border-[#212121] bg-[#121212] shadow-2xl lg:grid-cols-[minmax(0,11fr)_minmax(0,13fr)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Left — previews */}
              <div className="flex min-h-0 flex-col bg-[#161616] p-5 lg:min-h-0 lg:overflow-hidden lg:p-6">
                <p className="shrink-0 text-[12px] font-semibold text-[#888888]">{step.stageLabel}</p>
                <div
                  className={`pointer-events-none mt-3 flex min-h-[140px] flex-1 flex-col select-none px-1 lg:min-h-0 ${isShowcaseCrop ? "items-center justify-center" : ""} ${ONBOARDING_PREVIEW_FRAME_MAX_WIDTH_CLASS}`}
                  aria-hidden
                >
                  <div
                    className={
                      isShowcaseCrop
                        ? ONBOARDING_PREVIEW_BORDER_SHELL_COMPACT_CLASS
                        : ONBOARDING_PREVIEW_BORDER_SHELL_CLASS
                    }
                  >
                    {isShowcaseCrop ? (
                      <Preview />
                    ) : (
                      <OnboardingScaledFrame
                        designWidth={ONBOARDING_PREVIEW_WIDTH}
                        designHeight={ONBOARDING_PREVIEW_HEIGHT}
                        className="w-full"
                      >
                        <Preview />
                      </OnboardingScaledFrame>
                    )}
                  </div>
                </div>
                <div className="pointer-events-auto mt-3 flex shrink-0 flex-wrap gap-1.5">
                  {ONBOARDING_STEPS.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStepIndex(i)}
                      className={
                        i === stepIndex
                          ? `${BTN_MODAL_FORMAT_SELECTED} h-9 min-h-9 px-2.5 text-[12px] min-w-0`
                          : `${BTN_FORMAT_IDLE} h-9 min-h-9 px-2.5 text-[12px] min-w-0`
                      }
                    >
                      {s.pillLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right — copy */}
              <div className="relative flex min-h-0 flex-col border-t border-[#212121] p-5 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-6">
                <button
                  type="button"
                  onClick={() => closeTour()}
                  className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md text-[#888888] hover:bg-[#1d1d1d] hover:text-white transition-colors cursor-pointer"
                  aria-label="Close product tour"
                >
                  <Icon name="XClose" size={16} aria-hidden />
                </button>

                <p className="text-[12px] text-[#555555]">
                  Step {stepIndex + 1} of {TOTAL}
                </p>
                <h2 id={titleId} className="mt-2 pr-10 text-[16px] font-medium text-white">
                  {step.title}
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed text-[#888888]">{step.body}</p>

                {step.externalLink && (
                  <a
                    href={step.externalLink.href}
                    {...EXTERNAL_LINK_PROPS}
                    className={`mt-4 inline-flex items-center gap-1.5 text-[13px] underline underline-offset-2 ${BRAND_LINK_TEXT_CLASS} ${BRAND_LINK_TEXT_HOVER_CLASS}`}
                  >
                    {step.externalLink.label}
                    <Icon name="LinkExternal01" size={16} aria-hidden />
                  </a>
                )}

                <div className="mt-auto flex items-center justify-between gap-2 pt-8">
                  <button
                    type="button"
                    onClick={() => goBack()}
                    disabled={isFirst}
                    className={`${BTN_GHOST} gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#888888]`}
                  >
                    <Icon name="ArrowLeft" size={16} aria-hidden />
                    Back
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => closeTour()} className={BTN_GHOST}>
                      Skip tour
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePrimary()}
                      className={BTN_PRIMARY}
                    >
                      {isLast ? "Get started" : "Next"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
