import BrandLogo from "@/components/shared/BrandLogo";

/** Same logo markup for library header + editor toolbar so position is identical across routes. */
const LOGO_PX = 52;

const LOGO_CLASS = "h-[52px] w-auto shrink-0 object-contain";

type AppChromeLogoProps = {
  className?: string;
};

export default function AppChromeLogo({ className }: AppChromeLogoProps) {
  return (
    <BrandLogo
      width={LOGO_PX}
      height={LOGO_PX}
      className={[LOGO_CLASS, className].filter(Boolean).join(" ")}
      priority
    />
  );
}
