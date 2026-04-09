import Image from "next/image";

/** Same logo markup for library header + editor toolbar so position is identical across routes. */
const LOGO_PX = 52;

export default function AppChromeLogo() {
  return (
    <Image
      src="/logo.png"
      alt="Redux"
      width={LOGO_PX}
      height={LOGO_PX}
      className="h-[52px] w-auto shrink-0 object-contain"
      priority
    />
  );
}
