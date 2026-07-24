import { Geist_Mono, Inter } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Clerk appearance + CSS — matches `--font-inter` from next/font on `<html>`. */
export const INTER_FONT_FAMILY = "var(--font-inter), sans-serif";
