"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

const AFTER_AUTH = "/library";

export default function SsoCallbackPage() {
  return (
    <>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl={AFTER_AUTH}
        signUpForceRedirectUrl={AFTER_AUTH}
      />
      <div id="clerk-captcha" />
    </>
  );
}
