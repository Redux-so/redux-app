import { Icon, type IconName } from "@/components/shared/Icon";
import { EMPTY_STATE_ICON_CLASS } from "@/lib/surface-colors";

type EmptyStateVariant = "default" | "compact";

interface EmptyStateProps {
  icon: IconName;
  message: string;
  description?: string;
  /** default: 48px icon for full regions; compact: 24px for sidebars/menus */
  variant?: EmptyStateVariant;
  align?: "center" | "start";
  className?: string;
}

const ICON_SIZE: Record<EmptyStateVariant, 24 | 48> = {
  default: 48,
  compact: 24,
};

export default function EmptyState({
  icon,
  message,
  description,
  variant = "default",
  align = "center",
  className = "",
}: EmptyStateProps) {
  const iconSize = ICON_SIZE[variant];

  return (
    <div
      role="status"
      className={[
        "flex flex-col justify-center",
        align === "start" ? "items-start text-left" : "items-center text-center",
        variant === "default" ? "gap-3" : "gap-2",
        className,
      ].join(" ")}
    >
      <Icon
        name={icon}
        size={iconSize}
        strokeWidth={variant === "default" ? 1.25 : 1.5}
        className={EMPTY_STATE_ICON_CLASS}
        aria-hidden
      />
      <p
        className={
          variant === "default"
            ? "text-[13px] leading-relaxed text-[#555555]"
            : "text-[12px] leading-relaxed text-[#555555]"
        }
      >
        {message}
      </p>
      {description ? (
        <p className="max-w-[280px] text-[12px] leading-relaxed text-[#444444]">
          {description}
        </p>
      ) : null}
    </div>
  );
}
