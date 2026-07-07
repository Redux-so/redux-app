import Image from "next/image";
import Link from "next/link";

interface ReduxClerkAuthShellProps {
  title: string;
  subtitle?: string;
  /** Show "Don't have an account? Sign up" directly under the heading. */
  signUpLink?: boolean;
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
  legalFooter = false,
  panelSize = "default",
  children,
}: ReduxClerkAuthShellProps) {
  const isLarge = panelSize === "large";

  return (
    <div className="flex min-h-dvh bg-[#0a0a0a] [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]">
      {/* Left — sign-in form panel */}
      <div className="flex min-h-dvh w-full flex-1 items-center justify-center px-5 py-10 sm:px-10 sm:py-16 lg:max-w-[55%] lg:flex-[1.1] lg:px-16">
        <div
          className={[
            "w-full",
            isLarge ? "max-w-[29rem]" : "max-w-[25rem]",
          ].join(" ")}
        >
          <div
            className={
              isLarge
                ? "mb-4 mt-10 flex justify-center sm:mt-12"
                : "mb-6 flex justify-center"
            }
          >
            <Image
              src="/logo.png"
              alt="Redux"
              width={260}
              height={85}
              className={
                isLarge
                  ? "h-[96px] w-auto object-contain sm:h-[104px]"
                  : "h-16 w-auto object-contain sm:h-[72px]"
              }
              priority
            />
          </div>

          <header className={isLarge ? "mb-7 text-center" : "mb-6 text-center"}>
            <h1
              className={[
                "font-semibold leading-tight text-white",
                isLarge ? "text-[24px]" : "text-[22px]",
              ].join(" ")}
            >
              {title}
            </h1>
            {signUpLink && (
              <p
                className={[
                  "mt-2.5 leading-snug text-white",
                  isLarge ? "text-[15px]" : "text-[14px]",
                ].join(" ")}
              >
                Don&apos;t have an account?{" "}
                <Link
                  href="/sign-up"
                  className="underline underline-offset-2 hover:text-white/80 transition-colors"
                >
                  Sign up
                </Link>
              </p>
            )}
            {subtitle && !signUpLink && (
              <p className="mt-2 text-[14px] leading-snug text-[#888888]">
                {subtitle}
              </p>
            )}
          </header>

          <div className="w-full min-w-0">{children}</div>

          {legalFooter && (
            <p
              className={[
                "mt-6 text-center leading-relaxed text-[#555555]",
                isLarge ? "text-[13px]" : "text-[12px]",
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

      {/* Right — full-bleed photo (desktop only) */}
      <div className="relative hidden min-h-dvh lg:block lg:max-w-[45%] lg:flex-1">
        <Image
          src="/mount-fuji.jpg"
          alt=""
          fill
          priority
          sizes="45vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}
