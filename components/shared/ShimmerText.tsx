interface ShimmerTextProps {
  /** Visible status label (also used for aria-label). */
  label: string;
  className?: string;
}

/**
 * Inline status label with a sweeping highlight overlay.
 * Base text stays solid #888888; shimmer is a clipped gradient layer on top.
 * Respects prefers-reduced-motion via `.shimmer-text-highlight` in globals.css.
 */
export function ShimmerText({ label, className = "" }: ShimmerTextProps) {
  const typography = className.trim();

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={[
        "shimmer-text relative inline-block select-none text-[#888888]",
        typography,
      ].join(" ")}
    >
      {label}
      <span
        aria-hidden
        className={["shimmer-text-highlight absolute inset-0", typography].join(" ")}
      >
        {label}
      </span>
    </span>
  );
}
