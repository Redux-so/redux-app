import Image from "next/image";

export default function ReduxClerkAuthShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0a0a0a] px-5 py-14 [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] sm:px-8 sm:py-20">
      <div className="flex w-full max-w-[min(100%,22rem)] flex-col items-center gap-12 sm:max-w-md sm:gap-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image
            src="/logo.png"
            alt="Redux"
            width={160}
            height={52}
            className="h-12 w-auto object-contain sm:h-14"
            priority
          />
          <p className="max-w-xs text-sm leading-relaxed text-[#888888]">
            Your AI agent for professional photo editing
          </p>
        </div>
        <div className="flex w-full justify-center">{children}</div>
      </div>
    </div>
  );
}
