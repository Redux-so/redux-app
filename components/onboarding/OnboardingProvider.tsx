"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type OpenSource = "auto" | "help";

interface OnboardingContextValue {
  isOpen: boolean;
  stepIndex: number;
  openTour: (source?: OpenSource) => void;
  closeTour: () => void;
  completeAndClose: () => Promise<void>;
  setStepIndex: (index: number) => void;
  goNext: () => void;
  goBack: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

async function markOnboardingComplete(): Promise<void> {
  await fetch("/api/user/onboarding", { method: "POST" });
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const openTour = useCallback((_source?: OpenSource) => {
    setStepIndex(0);
    setIsOpen(true);
  }, []);

  const completeAndClose = useCallback(async () => {
    try {
      await markOnboardingComplete();
    } catch {
      // Still close — user explicitly dismissed; retry on next session if needed.
    }
    setIsOpen(false);
    setStepIndex(0);
  }, []);

  const closeTour = useCallback(() => {
    void completeAndClose();
  }, [completeAndClose]);

  const goNext = useCallback(() => {
    setStepIndex((i) => i + 1);
  }, []);

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      stepIndex,
      openTour,
      closeTour,
      completeAndClose,
      setStepIndex,
      goNext,
      goBack,
    }),
    [isOpen, stepIndex, openTour, closeTour, completeAndClose, goNext, goBack],
  );

  return (
    <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}
