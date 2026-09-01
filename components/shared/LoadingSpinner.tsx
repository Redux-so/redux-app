"use client";

const SIZE_CLASSES = {
  xs: "h-3 w-3 border",
  sm: "h-3.5 w-3.5 border-[1.5px]",
  md: "h-5 w-5 border-2",
  lg: "h-8 w-8 border-2",
} as const;

const VARIANT_CLASSES = {
  default: "border-[#2a2a2a]/20 border-t-[#2a2a2a]",
  muted: "border-white/10 border-t-[#555555]",
  brand: "border-[#794ADE]/25 border-t-[#A688F0]",
} as const;

export type LoadingSpinnerSize = keyof typeof SIZE_CLASSES;
export type LoadingSpinnerVariant = keyof typeof VARIANT_CLASSES;

interface LoadingSpinnerProps {
  size?: LoadingSpinnerSize;
  variant?: LoadingSpinnerVariant;
  className?: string;
  label?: string;
  showLabel?: boolean;
}

export function LoadingSpinner({
  size = "sm",
  variant = "default",
  className = "",
  label = "Loading",
  showLabel = false,
}: LoadingSpinnerProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 ${className}`}
      role="status"
      aria-label={label}
    >
      <span
        className={`rounded-full animate-spin ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]}`}
        aria-hidden
      />
      {showLabel ? (
        <span className="text-[13px] text-[#888888]">{label}</span>
      ) : null}
    </span>
  );
}

interface LoadingOverlayProps {
  message?: string;
  className?: string;
  size?: LoadingSpinnerSize;
  variant?: LoadingSpinnerVariant;
  /** When true, message is only used for aria-label (not shown visually). */
  srOnlyMessage?: boolean;
}

export function LoadingOverlay({
  message,
  className = "",
  size = "md",
  variant = "default",
  srOnlyMessage = false,
}: LoadingOverlayProps) {
  const label = message ?? "Loading";

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
      role="status"
      aria-label={label}
    >
      <LoadingSpinner size={size} variant={variant} label={label} />
      {message && !srOnlyMessage ? (
        <span className="text-[14px] text-[#888888]">{message}</span>
      ) : null}
    </div>
  );
}
