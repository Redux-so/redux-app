import Image from "next/image";

interface ReduxClerkAuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export default function ReduxClerkAuthShell({
  title,
  subtitle,
  children,
}: ReduxClerkAuthShellProps) {
  return (
    <div className="flex min-h-dvh bg-[#0a0a0a] [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]">
      {/* Left — sign-in form panel */}
      <div className="flex min-h-dvh w-full flex-1 items-center justify-center px-5 py-10 sm:px-10 sm:py-16 lg:max-w-[55%] lg:flex-[1.1] lg:px-16">
        <div className="w-full max-w-[25rem]">
          <div className="overflow-visible rounded-2xl border border-white/10 bg-[#111111] px-6 py-8 sm:px-8">
            <div className="mb-6 flex justify-center">
              <Image
                src="/logo.png"
                alt="Redux"
                width={120}
                height={40}
                className="h-9 w-auto object-contain"
                priority
              />
            </div>

            <header className="mb-6 text-center">
              <h1 className="text-[22px] font-semibold leading-tight text-white">
                {title}
              </h1>
              <p className="mt-2 text-[14px] leading-snug text-[#888888]">
                {subtitle}
              </p>
            </header>

            <div className="auth-clerk-root w-full min-w-0 overflow-visible">
              {children}
            </div>
          </div>
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
