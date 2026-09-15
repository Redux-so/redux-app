"use client";

import { type ReactNode } from "react";

import OnboardingModal from "@/components/onboarding/OnboardingModal";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";

export default function OnboardingHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingProvider>
      {children}
      <OnboardingModal />
    </OnboardingProvider>
  );
}
