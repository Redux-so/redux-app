"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { LoadingOverlay } from "@/components/shared/LoadingSpinner";
import { SURFACE_BG_MAIN } from "@/lib/surface-colors";

const AFTER_AUTH = "/library";

export default function SsoCallbackPage() {
  return (
    <>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl={AFTER_AUTH}
        signUpForceRedirectUrl={AFTER_AUTH}
      />
      <LoadingOverlay className={`min-h-dvh w-full flex-1 ${SURFACE_BG_MAIN}`} />
      <div id="clerk-captcha" />
    </>
  );
}
