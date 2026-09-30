import Image from "next/image";

import { BRAND_LOGO_IMAGE } from "@/constants/brand";

export type BrandLogoProps = {
  width: number;
  height: number;
  className?: string;
  alt?: string;
  priority?: boolean;
  /** Decorative instances use empty alt and aria-hidden. */
  decorative?: boolean;
};

export default function BrandLogo({
  width,
  height,
  className,
  alt = "Redux",
  priority,
  decorative = false,
}: BrandLogoProps) {
  return (
    <Image
      src={BRAND_LOGO_IMAGE}
      alt={decorative ? "" : alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
      aria-hidden={decorative ? true : undefined}
    />
  );
}
