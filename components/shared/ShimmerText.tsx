interface ShimmerTextProps {
  /** Visible status label (also used for aria-label). */
  label: string;
  className?: string;
}

/**
 * Inline status label with a CSS shimmer sweep (background-clip text).
 * Respects prefers-reduced-motion via `.shimmer-text` in globals.css.
 * Do not pass Tailwind `text-*` color utilities — they break the gradient fill.
 */
export function ShimmerText({ label, className = "" }: ShimmerTextProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={["shimmer-text inline-block select-none", className].join(" ")}
    >
      {label}
    </span>
  );
}
