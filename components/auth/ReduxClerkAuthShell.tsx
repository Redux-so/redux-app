import Image from "next/image";
import Link from "next/link";

interface ReduxClerkAuthShellProps {
  title: string;
  subtitle?: string;
  /** Show "Don't have an account? Sign up" directly under the heading. */
  signUpLink?: boolean;
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
  signInLink = false,
  legalFooter = false,
  panelSize = "default",
  children,
}: ReduxClerkAuthShellProps) {
  const isLarge = panelSize === "large";

  return (
    <div className="grid h-screen w-screen grid-cols-1 overflow-hidden bg-[#0a0a0a] [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] lg:grid-cols-2">
      {/* Left — sign-in form panel (exactly 50% on lg+) */}
      <div className="flex h-full w-full min-w-0 items-center justify-center px-5 py-10 sm:px-10 sm:py-16 lg:px-16">
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
            <Image
              src="/logo.png"
              alt="Redux"
              width={260}
              height={85}
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
                Don&apos;t have an account?{" "}
                <Link
                  href="/sign-up"
                  className="underline underline-offset-2 hover:text-white/80 transition-colors"
                >
                  Sign up
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
                href="#"
                className="underline underline-offset-2 hover:text-[#888888] transition-colors"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="#"
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
          src="/mount-fuji.jpg"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}
