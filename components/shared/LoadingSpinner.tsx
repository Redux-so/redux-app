"use client";

const SIZE_CLASSES = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-8 w-8",
} as const;

const SPINNER_STYLE = "rounded-full animate-spin border-[1.5px] border-solid border-[#333333] border-t-[#888888]";

export type LoadingSpinnerSize = keyof typeof SIZE_CLASSES;

interface LoadingSpinnerProps {
  size?: LoadingSpinnerSize;
  className?: string;
  label?: string;
}

/** Visible loading UI is always spinner-only; labels remain accessible. */
export function LoadingSpinner({
  size = "sm",
  className = "",
  label = "Loading",
}: LoadingSpinnerProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 ${className}`}
      role="status"
      aria-label={label}
      data-loading-spinner
    >
      <span
        className={`${SPINNER_STYLE} ${SIZE_CLASSES[size]}`}
        aria-hidden
      />
    </span>
  );
}

interface LoadingOverlayProps {
  message?: string;
  className?: string;
  size?: LoadingSpinnerSize;
}

export function LoadingOverlay({
  message,
  className = "",
  size = "md",
}: LoadingOverlayProps) {
  const label = message ?? "Loading";

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
      role="status"
      aria-label={label}
    >
      <LoadingSpinner size={size} label={label} />
    </div>
  );
}
