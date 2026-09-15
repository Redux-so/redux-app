"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";

import { useOnboarding } from "@/components/onboarding/OnboardingProvider";

/** Opens the product tour once for users who have not completed onboarding. */
export default function OnboardingAutoOpen() {
  const { isLoaded, isSignedIn } = useUser();
  const { openTour, isOpen } = useOnboarding();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || attemptedRef.current || isOpen) return;

    attemptedRef.current = true;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/user/onboarding", { cache: "no-store" });
          if (!res.ok) return;
          const data = (await res.json()) as { completed?: boolean };
          if (!data.completed) {
            openTour("auto");
          }
        } catch {
          // Non-blocking
        }
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [isLoaded, isSignedIn, isOpen, openTour]);

  return null;
}
