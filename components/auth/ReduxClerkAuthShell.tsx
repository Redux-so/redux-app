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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0a0a0a] px-5 py-10 [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] sm:px-8 sm:py-16">
      <div className="flex w-full max-w-[min(100%,25rem)] flex-col items-center gap-8">
        <Image
          src="/logo.png"
          alt="Redux"
          width={160}
          height={52}
          className="h-11 w-auto object-contain sm:h-12"
          priority
        />

        <div className="w-full overflow-visible rounded-2xl border border-white/10 bg-[#111111] px-6 py-8 sm:px-8">
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
  );
}
