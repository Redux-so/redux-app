"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "framer-motion";
import { Icon } from "@/components/shared/Icon";
import IntroductionPreview from "@/components/shared/IntroductionPreview";
import BrandLogo from "@/components/shared/BrandLogo";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { BTN_MODAL_SOLID } from "@/lib/button-styles";
import { SURFACE_GHOST_BTN, SURFACE_POPOVER } from "@/lib/surface-colors";

const STEPS: { title: string; description: string }[] = [
  {
    title: "Welcome to Redux",
    description: "The agentic photo editing platform",
  },
  {
    title: "Start with a photo",
    description: "Upload a photo, organize it in an album, and open it to edit.",
  },
  {
    title: "Edit your way",
    description: "Adjust your photo manually or let Agent edit it. Use Ask for advice.",
  },
  {
    title: "Save and export",
    description: "Edits save automatically. Revisit versions in History and download your photo.",
  },
];

/** Completion belongs to the account so it survives browser and device changes. */
export default function Introduction({ automatic = false }: { automatic?: boolean }) {
  const { user, isLoaded } = useUser();
  const reduceMotion = useReducedMotion();
  const [replayOpen, setReplayOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoaded || !user) return null;

  const completed = user.unsafeMetadata.reduxIntroductionDismissed === true;
  const open = replayOpen || (automatic && !dismissed && !completed);
  const current = STEPS[step];
  const lastStep = step === STEPS.length - 1;

  async function dismiss() {
    if (saving || !user) return;
    setSaving(true);
    setError(null);
    try {
      if (!completed) {
        await user.update({
          unsafeMetadata: { ...user.unsafeMetadata, reduxIntroductionDismissed: true },
        });
      }
      setDismissed(true);
      setReplayOpen(false);
    } catch {
      setError("Couldn't save your progress. Try closing or finishing again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) void dismiss(); }}>
      {!automatic && (
        <Dialog.Trigger asChild>
          <button
            type="button"
            className={`${SURFACE_GHOST_BTN} h-9 rounded-md px-4 text-[14px] whitespace-nowrap`}
            onClick={() => { setStep(0); setError(null); setReplayOpen(true); }}
          >
            Introduction
          </button>
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/60" />
        <div className="viewport-modal fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none">
          <Dialog.Content
            asChild
            onPointerDownOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }}
          >
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`${SURFACE_POPOVER} pointer-events-auto [container-type:size] flex aspect-square w-[min(480px,calc(100vw-32px),calc(var(--app-height,100dvh)-32px))] flex-col overflow-hidden rounded-xl shadow-2xl outline-none`}
            >
              <div className="flex shrink-0 items-center justify-between px-5 pt-4 sm:px-6">
                <span className="text-[10px] text-[#888888]" aria-live="polite" aria-atomic="true">
                  {step + 1} of {STEPS.length}
                </span>
                <button
                  type="button"
                  aria-label="Close introduction"
                  disabled={saving}
                  onClick={() => void dismiss()}
                  className="-mr-2 flex h-8 w-8 items-center justify-center rounded-md text-[#888888] hover:bg-[#1d1d1d] hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  <Icon name="XClose" size={16} />
                </button>
              </div>
              <ol aria-label="Introduction progress" className="mt-2 flex shrink-0 gap-1.5 px-5 sm:px-6">
                {STEPS.map((item, index) => (
                  <li
                    key={item.title}
                    aria-current={index === step ? "step" : undefined}
                    aria-label={`Step ${index + 1}: ${item.title}${index <= step ? ", viewed" : ""}`}
                    className={`h-[2px] flex-1 rounded-sm transition-colors motion-reduce:transition-none ${index <= step ? "bg-[#ededed]" : "bg-[#333333]"}`}
                  />
                ))}
              </ol>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-7 py-5 sm:px-12">
                <div className={`my-auto min-h-0 w-full ${step === 0 ? "flex flex-col items-center gap-5 text-center" : "translate-y-2"}`}>
                  {step === 0 && <BrandLogo width={64} height={64} decorative className="mx-auto h-16 w-16 object-contain" />}
                  {step > 0 && <IntroductionPreview step={step} />}
                  <Dialog.Title className={`font-medium leading-tight text-white ${step === 0 ? "text-[26px] sm:text-[30px]" : "text-[16px] sm:text-[18px]"}`}>
                    {current.title}
                  </Dialog.Title>
                  <Dialog.Description className={`leading-relaxed text-[#888888] ${step === 0 ? "text-[14px] sm:text-[15px]" : "mt-2.5 text-[11px]"}`}>
                    {current.description}
                  </Dialog.Description>
                </div>
              </div>
              <div className="shrink-0 px-7 pb-6 sm:px-12 sm:pb-7">
                {error && <p role="alert" className="mb-3 text-[12px] text-white">{error}</p>}
                <div className="flex items-center justify-end gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Previous step"
                      disabled={step === 0 || saving}
                      onClick={() => setStep((previous) => Math.max(0, previous - 1))}
                      className={`${SURFACE_GHOST_BTN} flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-30 disabled:cursor-not-allowed`}
                    >
                      <Icon name="ChevronLeft" size={16} />
                    </button>
                    {lastStep ? (
                      <button type="button" disabled={saving} onClick={() => void dismiss()} className={`${BTN_MODAL_SOLID} !h-8 !px-3 !text-[12px]`}>
                        {saving ? <LoadingSpinner size="xs" label="Saving introduction" /> : "Finish"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label="Next step"
                        disabled={saving}
                        onClick={() => {
                          const next = Math.min(STEPS.length - 1, step + 1);
                          setStep(next);
                        }}
                        className={`${SURFACE_GHOST_BTN} flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-30 disabled:cursor-not-allowed`}
                      >
                        <Icon name="ChevronRight" size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
