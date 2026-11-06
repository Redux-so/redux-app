import Image from "next/image";
import Link from "next/link";

import BrandLogo from "@/components/shared/BrandLogo";
import { AUTH_HERO_IMAGE } from "@/constants/brand";

import {
  EXTERNAL_LINK_PROPS,
  REDUX_PRIVACY_URL,
  REDUX_TERMS_URL,
} from "@/constants/support";

interface ReduxClerkAuthShellProps {
  title: string;
  subtitle?: string;
  /** Show "Don't have an account? Sign up" directly under the heading. */
  signUpLink?: boolean;
  invitationSignUpHref?: string;
  /** Show "Already have an account? Log in" directly under the heading. */
  signInLink?: boolean;
  /** Show Terms / Privacy footer below the form. */
  legalFooter?: boolean;
  /** Slightly larger width, type, and logo for sign-in. */
  panelSize?: "default" | "large";
  children: React.ReactNode;
}

export default function ReduxClerkAuthShell({
  title,
  subtitle,
  signUpLink = false,
  invitationSignUpHref,
  signInLink = false,
  legalFooter = false,
  panelSize = "default",
  children,
}: ReduxClerkAuthShellProps) {
  const isLarge = panelSize === "large";

  return (
    <div className="grid h-screen w-screen grid-cols-1 overflow-hidden bg-[#161616] lg:grid-cols-2">
      {/* Left — sign-in form panel (exactly 50% on lg+) */}
      <div className="flex h-full w-full min-w-0 items-center justify-center bg-[#161616] px-5 py-10 sm:px-10 sm:py-16 lg:px-16">
        <div
          className={[
            "w-full",
            isLarge ? "max-w-[24rem]" : "max-w-[22rem]",
          ].join(" ")}
        >
          <div
            className={
              isLarge
                ? "mb-3 mt-6 flex justify-center sm:mt-8"
                : "mb-5 flex justify-center"
            }
          >
            <BrandLogo
              width={260}
              height={260}
              className={
                isLarge
                  ? "h-[76px] w-auto object-contain sm:h-[84px]"
                  : "h-14 w-auto object-contain sm:h-16"
              }
              priority
            />
          </div>

          <header className={isLarge ? "mb-5 text-center" : "mb-5 text-center"}>
            <h1 className="text-[20px] font-semibold leading-tight text-white">
              {title}
            </h1>
            {signUpLink && (
              <p className="mt-2 text-[13px] leading-snug text-white">
                {invitationSignUpHref ? "Invited to the beta?" : "Don’t have an account?"}{" "}
                <Link
                  href={invitationSignUpHref ?? "/sign-up"}
                  prefetch={invitationSignUpHref ? false : undefined}
                  className="underline underline-offset-2 hover:text-white/80 transition-colors"
                >
                  {invitationSignUpHref ? "Create an account" : "Sign up"}
                </Link>
              </p>
            )}
            {signInLink && (
              <p className="mt-2 text-[13px] leading-snug text-white">
                Already have an account?{" "}
                <Link
                  href="/sign-in"
                  className="underline underline-offset-2 hover:text-white/80 transition-colors"
                >
                  Log in
                </Link>
              </p>
            )}
            {subtitle && !signUpLink && !signInLink && (
              <p className="mt-1.5 text-[13px] leading-snug text-[#888888]">
                {subtitle}
              </p>
            )}
          </header>

          <div className="w-full min-w-0">{children}</div>

          {legalFooter && (
            <p
              className={[
                "mt-5 text-center leading-relaxed text-[#555555]",
                isLarge ? "text-[12px]" : "text-[11px]",
              ].join(" ")}
            >
              By clicking continue, you agree to our{" "}
              <a
                href={REDUX_TERMS_URL}
                {...EXTERNAL_LINK_PROPS}
                className="underline underline-offset-2 hover:text-[#888888] transition-colors"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href={REDUX_PRIVACY_URL}
                {...EXTERNAL_LINK_PROPS}
                className="underline underline-offset-2 hover:text-[#888888] transition-colors"
              >
                Privacy Policy
              </a>
              .
            </p>
          )}
        </div>
      </div>

      {/* Right — full-bleed photo (exactly 50% on lg+) */}
      <div className="relative hidden h-full w-full min-w-0 lg:block">
        <Image
          src={AUTH_HERO_IMAGE}
          alt=""
          fill
          priority
          unoptimized
          className="object-cover"
        />
      </div>
    </div>
  );
}
