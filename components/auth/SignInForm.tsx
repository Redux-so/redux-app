"use client";

import { appPath } from "@/lib/app-path";

import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk, useSignIn } from "@clerk/nextjs";

import { authenticateWithGooglePopup } from "@/lib/google-auth-popup";
import { AUTH_PRIMARY_BTN_CLASS } from "@/lib/brand-colors";

const AFTER_AUTH = "/library";

const AUTH_INPUT =
  "h-10 w-full rounded-lg border border-solid border-[#262626] bg-[#1d1d1d] px-3 text-[13px] text-white placeholder:text-[#555555] outline-none transition-colors focus:border-[#2e2e2e] disabled:opacity-50 disabled:cursor-not-allowed";

const AUTH_LABEL = "text-[13px] font-medium text-white";

const AUTH_PRIMARY_BTN = AUTH_PRIMARY_BTN_CLASS;

const AUTH_GOOGLE_BTN =
  "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-solid border-[#262626] bg-[#1d1d1d] px-4 text-[13px] font-medium leading-none text-white transition-colors hover:bg-white/[0.05] hover:border-[#2e2e2e] disabled:opacity-40 disabled:cursor-not-allowed";

const AUTH_SECONDARY_LINK =
  "text-[13px] font-medium text-white underline underline-offset-2 hover:text-white/80 transition-colors";

type View = "sign-in" | "forgot-password" | "client-trust";

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

export default function SignInForm() {
  const router = useRouter();
  const clerk = useClerk();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { signIn, errors, fetchStatus } = useSignIn();

  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotCodeSent, setForgotCodeSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"password" | "google" | "verify" | "resend" | null>(null);

  const isClerkReady = mounted && authLoaded && clerk.loaded;
  const isBusy = pendingAction !== null || fetchStatus === "fetching";

  const globalError =
    formError ??
    errors.global?.[0]?.longMessage ??
    errors.global?.[0]?.message ??
    errors.fields?.identifier?.longMessage ??
    errors.fields?.identifier?.message ??
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

  const finalizeSignIn = useCallback(async () => {
    const { error } = await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setFormError("Your account needs another step before you can sign in. Please contact Redux support.");
          return;
        }
        window.location.assign(decorateUrl(appPath(AFTER_AUTH)));
      },
    });
    if (error) setFormError(getClerkErrorMessage(error));
  }, [signIn]);

  async function handleEmailPasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isClerkReady || isBusy) return;

    const formData = new FormData(e.currentTarget);
    const emailAddress = String(formData.get("email") ?? "").trim();
    const passwordValue = String(formData.get("password") ?? "");

    if (!emailAddress || !passwordValue) {
      setFormError("Enter your email and password.");
      return;
    }

    setFormError(null);
    setPendingAction("password");

    try {
      const { error } = await signIn.password({
        emailAddress,
        password: passwordValue,
      });
      if (error) {
        const message = getClerkErrorMessage(error);
        setFormError(
          message.includes("verification strategy is not valid")
            ? "This account uses Google sign-in. Click Continue with Google instead."
            : message,
        );
        return;
      }
      if (signIn.status === "complete") {
        await finalizeSignIn();
        return;
      }

      const needsVerification =
        signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor";
      if (needsVerification) {
        const supportsEmailCode = signIn.supportedSecondFactors?.some(
          (factor) => factor.strategy === "email_code",
        );
        if (!supportsEmailCode) {
          setFormError("Your account requires another verification method. Please contact Redux support.");
          return;
        }

        const { error: sendError } = await signIn.mfa.sendEmailCode();
        if (sendError) {
          setFormError(getClerkErrorMessage(sendError));
          return;
        }

        setView("client-trust");
        return;
      }

      setFormError("We couldn't complete sign-in. Please try again.");
    } catch (err) {
      setFormError(getClerkErrorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleClientTrustVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!isClerkReady || isBusy) return;

    setFormError(null);
    setPendingAction("verify");
    try {
      const { error } = await signIn.mfa.verifyEmailCode({ code: verificationCode.trim() });
      if (error) {
        setFormError(getClerkErrorMessage(error));
      } else if (signIn.status === "complete") {
        await finalizeSignIn();
      } else {
        setFormError("We couldn't complete verification. Please try again.");
      }
    } catch (err) {
      setFormError(getClerkErrorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleResendClientTrustCode() {
    if (!isClerkReady || isBusy) return;

    setFormError(null);
    setPendingAction("resend");
    try {
      const { error } = await signIn.mfa.sendEmailCode();
      if (error) setFormError(getClerkErrorMessage(error));
      else setVerificationCode("");
    } catch (err) {
      setFormError(getClerkErrorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleForgotSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!isClerkReady) return;

    const { error: createError } = await signIn.create({ identifier: email });
    if (createError) return;

    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) return;

    setForgotCodeSent(true);
  }

  async function handleForgotVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!isClerkReady) return;

    const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code: forgotCode });
    if (error) return;
  }

  async function handleForgotSubmitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!isClerkReady) return;

    const { error } = await signIn.resetPasswordEmailCode.submitPassword({
      password: newPassword,
      signOutOfOtherSessions: true,
    });
    if (error) return;

    if (signIn.status === "complete") {
      await finalizeSignIn();
    }
  }

  async function handleGoogleSignIn() {
    const client = clerk.client;
    if (!isClerkReady || isBusy || !client) return;

    setFormError(null);
    setPendingAction("google");

    try {
      await authenticateWithGooglePopup((popup) =>
        client.signIn.authenticateWithPopup({
          popup,
          strategy: "oauth_google",
          redirectUrl: new URL(appPath("/sso-callback"), window.location.origin).href,
          redirectUrlComplete: new URL(appPath(AFTER_AUTH), window.location.origin).href,
          continueSignIn: false,
        }),
      );
    } catch (err) {
      setFormError(getClerkErrorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  if (!mounted || (authLoaded && isSignedIn)) {
    return null;
  }

  if (view === "client-trust") {
    return (
      <div className="flex w-full flex-col gap-4">
        <p className="text-center text-[13px] text-[#888888] leading-snug">
          We sent a verification code to your email. Enter it below to continue.
        </p>
        <form onSubmit={handleClientTrustVerify} className="flex flex-col gap-4">
          <FormError message={formError ?? errors.fields?.code?.message} />
          <div>
            <label htmlFor="verification-code" className={AUTH_LABEL}>
              Verification code
            </label>
            <input
              id="verification-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              className={`${AUTH_INPUT} mt-1`}
              disabled={isBusy}
            />
          </div>
          <button type="submit" disabled={isBusy || !verificationCode} className={AUTH_PRIMARY_BTN}>
            {pendingAction === "verify" ? <LoadingSpinner size="sm" label="Verifying code" /> : "Verify"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => { void handleResendClientTrustCode(); }}
          disabled={isBusy}
          className={`${AUTH_SECONDARY_LINK} text-center disabled:opacity-40`}
        >
          {pendingAction === "resend" ? <LoadingSpinner size="sm" label="Resending code" /> : "Resend code"}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            void signIn.reset();
            setFormError(null);
            setView("sign-in");
            setVerificationCode("");
          }}
          className={`${AUTH_SECONDARY_LINK} text-center`}
        >
          Back to sign in
        </button>
        <ClerkFooter />
      </div>
    );
  }

  if (view === "forgot-password") {
    return (
      <div className="flex w-full flex-col gap-4">
        <p className="text-center text-[13px] text-[#888888] leading-snug">
          Enter your email and we&apos;ll send you a password reset code.
        </p>

        {!forgotCodeSent && (
          <form onSubmit={handleForgotSendCode} className="flex flex-col gap-4">
            <div>
              <label htmlFor="forgot-email" className={AUTH_LABEL}>
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${AUTH_INPUT} mt-1`}
                disabled={isBusy}
              />
              <FieldError message={errors.fields?.identifier?.message} />
            </div>
            <button type="submit" disabled={isBusy || !email} className={AUTH_PRIMARY_BTN}>
              Send reset code
            </button>
          </form>
        )}

        {forgotCodeSent && signIn.status !== "needs_new_password" && (
          <form onSubmit={handleForgotVerifyCode} className="flex flex-col gap-4">
            <div>
              <label htmlFor="forgot-code" className={AUTH_LABEL}>
                Reset code
              </label>
              <input
                id="forgot-code"
                type="text"
                inputMode="numeric"
                value={forgotCode}
                onChange={(e) => setForgotCode(e.target.value)}
                className={`${AUTH_INPUT} mt-1`}
                disabled={isBusy}
              />
              <FieldError message={errors.fields?.code?.message} />
            </div>
            <button type="submit" disabled={isBusy || !forgotCode} className={AUTH_PRIMARY_BTN}>
              Verify code
            </button>
          </form>
        )}

        {signIn.status === "needs_new_password" && (
          <form onSubmit={handleForgotSubmitPassword} className="flex flex-col gap-4">
            <div>
              <label htmlFor="new-password" className={AUTH_LABEL}>
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`${AUTH_INPUT} mt-1`}
                disabled={isBusy}
              />
              <FieldError message={errors.fields?.password?.message} />
            </div>
            <button type="submit" disabled={isBusy || !newPassword} className={AUTH_PRIMARY_BTN}>
              Set new password
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => {
            void signIn.reset();
            setView("sign-in");
            setForgotCodeSent(false);
            setForgotCode("");
            setNewPassword("");
          }}
          className={`${AUTH_SECONDARY_LINK} text-center`}
        >
          Back to sign in
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
          <FieldError message={errors.fields?.identifier?.message} />
        </div>

        <div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT}
            disabled={!isClerkReady}
          />
          <FieldError message={errors.fields?.password?.message} />
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => setView("forgot-password")}
              className={AUTH_SECONDARY_LINK}
            >
              Forgot password?
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={!isClerkReady || isBusy}
          className={AUTH_PRIMARY_BTN}
        >
          {pendingAction === "password" ? <LoadingSpinner size="sm" label="Signing in" /> : (
            <>Login<span aria-hidden className="text-base leading-none">›</span></>
          )}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/[0.08]" />
        <span className="text-[12px] text-[#555555]">Or</span>
        <div className="h-px flex-1 bg-white/[0.08]" />
      </div>

      <button
        type="button"
        onClick={() => { void handleGoogleSignIn(); }}
        disabled={!isClerkReady || isBusy}
        className={AUTH_GOOGLE_BTN}
      >
        {pendingAction === "google" ? <LoadingSpinner size="sm" label="Continuing with Google" /> : (
          <><GoogleIcon />Continue with Google</>
        )}
      </button>

      <ClerkFooter />
    </div>
  );
}
