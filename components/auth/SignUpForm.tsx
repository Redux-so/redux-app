"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk, useSignUp } from "@clerk/nextjs";

const AFTER_AUTH = "/library";

const AUTH_INPUT =
  "h-10 w-full rounded-lg border border-solid border-[#2e2e2e] bg-[#1d1d1d] px-3 text-[13px] text-white placeholder:text-[#555555] outline-none transition-colors focus:border-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed";

const AUTH_LABEL = "text-[13px] font-medium text-white";

const AUTH_PRIMARY_BTN =
  "inline-flex h-10 w-full items-center justify-center gap-1 rounded-md border border-white/20 bg-[#8758ed] text-[13px] font-medium leading-none text-white shadow-btn-primary transition-[background-color,box-shadow] duration-200 hover:bg-[#9a6ff2] hover:shadow-btn-primary-hover active:shadow-btn-primary-active disabled:opacity-40 disabled:cursor-not-allowed";

const AUTH_GOOGLE_BTN =
  "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-solid border-[#2e2e2e] bg-[#1d1d1d] px-4 text-[13px] font-medium leading-none text-white transition-colors hover:bg-white/[0.05] hover:border-[#3a3a3a] disabled:opacity-40 disabled:cursor-not-allowed";

const AUTH_SECONDARY_LINK =
  "text-[13px] font-medium text-white underline underline-offset-2 hover:text-white/80 transition-colors";

type View = "sign-up" | "verify-email";

function getClerkErrorMessage(error: unknown): string {
  if (!error) {
    return "Something went wrong. Please try again.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object") {
    const clerkError = error as {
      message?: string;
      longMessage?: string;
      errors?: Array<{ message?: string; longMessage?: string }>;
    };

    const nested =
      clerkError.errors?.[0]?.longMessage ?? clerkError.errors?.[0]?.message;

    if (nested) return nested;
    if (clerkError.longMessage) return clerkError.longMessage;
    if (clerkError.message) return clerkError.message;
  }

  return "Something went wrong. Please try again.";
}

function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-300 leading-snug"
    >
      {message}
    </p>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] text-red-400 leading-snug">{message}</p>;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function ClerkFooter() {
  return (
    <div className="mt-5 flex flex-col items-center gap-1">
      <a
        href="https://clerk.com"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-[10px] text-[#555555] hover:text-[#888888] transition-colors"
      >
        Secured by
        <span className="font-semibold text-[#888888]">Clerk</span>
      </a>
      {process.env.NODE_ENV === "development" && (
        <span className="text-[10px] font-medium text-orange-400">Development mode</span>
      )}
    </div>
  );
}

export default function SignUpForm() {
  const router = useRouter();
  const clerk = useClerk();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { signUp, errors, fetchStatus } = useSignUp();

  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>("sign-up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isClerkReady = mounted && authLoaded && clerk.loaded;
  const isBusy = isSubmitting || fetchStatus === "fetching";

  const globalError =
    formError ??
    errors.global?.[0]?.longMessage ??
    errors.global?.[0]?.message ??
    errors.fields?.emailAddress?.longMessage ??
    errors.fields?.emailAddress?.message ??
    errors.fields?.password?.longMessage ??
    errors.fields?.password?.message ??
    null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (authLoaded && isSignedIn) {
      router.replace(AFTER_AUTH);
    }
  }, [authLoaded, isSignedIn, router]);

  const finalizeSignUp = useCallback(async () => {
    await signUp.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          console.warn("[SignUp] session task pending:", session.currentTask);
          return;
        }
        const url = decorateUrl(AFTER_AUTH);
        if (url.startsWith("http")) {
          window.location.href = url;
        } else {
          router.push(url);
        }
      },
    });
  }, [router, signUp]);

  async function handleEmailVerificationNeeded() {
    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) {
      setFormError(getClerkErrorMessage(sendError));
      return;
    }
    setView("verify-email");
  }

  async function handleEmailPasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isClerkReady || isBusy) return;

    const formData = new FormData(e.currentTarget);
    const emailAddress = String(formData.get("email") ?? "").trim();
    const passwordValue = String(formData.get("password") ?? "");
    const confirmPasswordValue = String(formData.get("confirmPassword") ?? "");

    if (!emailAddress || !passwordValue) {
      setFormError("Enter your email and password.");
      return;
    }

    if (passwordValue !== confirmPasswordValue) {
      setFormError("Passwords do not match.");
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const { error } = await signUp.password({
        emailAddress,
        password: passwordValue,
      });
      if (error) {
        setFormError(getClerkErrorMessage(error));
        return;
      }
    } catch (err) {
      setFormError(getClerkErrorMessage(err));
      return;
    } finally {
      setIsSubmitting(false);
    }

    if (signUp.isTransferable) {
      setFormError("An account with this email already exists. Log in instead.");
      return;
    }

    if (signUp.status === "complete") {
      await finalizeSignUp();
      return;
    }

    if (
      signUp.status === "missing_requirements" &&
      signUp.unverifiedFields.includes("email_address")
    ) {
      await handleEmailVerificationNeeded();
    }
  }

  async function handleVerifyEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!isClerkReady || isBusy || !verificationCode) return;

    setFormError(null);
    setIsSubmitting(true);

    try {
      const { error } = await signUp.verifications.verifyEmailCode({
        code: verificationCode,
      });
      if (error) {
        setFormError(getClerkErrorMessage(error));
        return;
      }
    } catch (err) {
      setFormError(getClerkErrorMessage(err));
      return;
    } finally {
      setIsSubmitting(false);
    }

    if (signUp.status === "complete") {
      await finalizeSignUp();
    }
  }

  async function handleResendVerificationCode() {
    if (!isClerkReady || isBusy) return;
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) {
      setFormError(getClerkErrorMessage(error));
    }
  }

  async function handleGoogleSignUp() {
    if (!isClerkReady || isBusy || !clerk.client) return;

    setFormError(null);
    setIsSubmitting(true);

    try {
      await clerk.client.signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: AFTER_AUTH,
      });
    } catch (err) {
      setFormError(getClerkErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  if (!mounted || (authLoaded && isSignedIn)) {
    return null;
  }

  if (view === "verify-email") {
    return (
      <div className="flex w-full flex-col gap-4">
        <FormError message={globalError} />
        <p className="text-center text-[13px] text-[#888888] leading-snug">
          We sent a verification code to your email. Enter it below to finish creating your account.
        </p>
        <form onSubmit={handleVerifyEmail} className="flex flex-col gap-4">
          <div>
            <label htmlFor="signup-verification-code" className={AUTH_LABEL}>
              Verification code
            </label>
            <input
              id="signup-verification-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              className={`${AUTH_INPUT} mt-1`}
              disabled={isBusy}
            />
            <FieldError message={errors.fields?.code?.message} />
          </div>
          <button type="submit" disabled={isBusy || !verificationCode} className={AUTH_PRIMARY_BTN}>
            Verify email
            <span aria-hidden className="text-base leading-none">
              ›
            </span>
          </button>
        </form>
        <button
          type="button"
          onClick={() => { void handleResendVerificationCode(); }}
          disabled={isBusy}
          className={`${AUTH_SECONDARY_LINK} text-center disabled:opacity-40`}
        >
          Resend code
        </button>
        <button
          type="button"
          onClick={() => {
            void signUp.reset();
            setView("sign-up");
            setVerificationCode("");
            setFormError(null);
          }}
          className={`${AUTH_SECONDARY_LINK} text-center`}
        >
          Back to sign up
        </button>
        <ClerkFooter />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <FormError message={globalError} />

      <form onSubmit={handleEmailPasswordSubmit} className="flex flex-col gap-4">
        <div>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT}
            disabled={!isClerkReady}
          />
          <FieldError message={errors.fields?.emailAddress?.message} />
        </div>

        <div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT}
            disabled={!isClerkReady}
          />
          <FieldError message={errors.fields?.password?.message} />
        </div>

        <div>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={AUTH_INPUT}
            disabled={!isClerkReady}
          />
        </div>

        <button
          type="submit"
          disabled={!isClerkReady || isBusy}
          className={AUTH_PRIMARY_BTN}
        >
          {!isClerkReady ? "Loading…" : isBusy ? "Signing up…" : "Sign Up"}
          <span aria-hidden className="text-base leading-none">
            ›
          </span>
        </button>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/[0.08]" />
        <span className="text-[12px] text-[#555555]">Or</span>
        <div className="h-px flex-1 bg-white/[0.08]" />
      </div>

      <button
        type="button"
        onClick={() => { void handleGoogleSignUp(); }}
        disabled={!isClerkReady || isBusy}
        className={AUTH_GOOGLE_BTN}
      >
        <GoogleIcon />
        {!isClerkReady ? "Loading…" : isBusy ? "Redirecting…" : "Continue with Google"}
      </button>

      <ClerkFooter />
      <div id="clerk-captcha" />
    </div>
  );
}
