interface AppChromePageTitleProps {
  title: string;
  variant?: "glass" | "solid";
}

export default function AppChromePageTitle({
  title,
  variant = "glass",
}: AppChromePageTitleProps) {
  const dividerClass =
    variant === "solid"
      ? "bg-[#2a2a2a]"
      : "bg-white/[0.08]";

  return (
    <>
      <div
        className={`w-px h-7 shrink-0 self-center ${dividerClass}`}
        aria-hidden
      />
      <span className="text-[16px] font-medium leading-none text-white select-none whitespace-nowrap">
        {title}
      </span>
    </>
  );
}
