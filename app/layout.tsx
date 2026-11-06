import { appPath } from "@/lib/app-path";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { reduxClerkProviderAppearance } from "@/lib/redux-clerk-appearance";
import { APPLE_TOUCH_ICON_PATH, FAVICON_PATH } from "@/constants/brand";
import { geistSans } from "@/lib/fonts";
import { SURFACE_MAIN_HEX } from "@/lib/surface-colors";
import LastVisitedPage from "@/components/shared/LastVisitedPage";
import "./globals.css";

const socialPreviewImage = {
  url: "https://redux.so/app/social-preview-v4.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Redux agentic photo editing platform",
};

export const metadata: Metadata = {
  title: "Redux",
  description: "AI-powered photo editing",
  openGraph: {
    type: "website",
    siteName: "Redux",
    images: [socialPreviewImage],
  },
  twitter: {
    card: "summary_large_image",
    images: [socialPreviewImage],
  },
  icons: {
    icon: [{ url: appPath(FAVICON_PATH), type: "image/png" }],
    apple: [{ url: appPath(APPLE_TOUCH_ICON_PATH) }],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: SURFACE_MAIN_HEX,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={reduxClerkProviderAppearance} dynamic>
      <html
        lang="en"
        style={{ backgroundColor: SURFACE_MAIN_HEX, colorScheme: "dark" }}
        className={`${geistSans.variable} h-full antialiased`}
      >
        <body
          className={`${geistSans.className} min-h-full flex flex-col`}
          style={{ backgroundColor: SURFACE_MAIN_HEX }}
        >
          <Suspense fallback={null}><LastVisitedPage /></Suspense>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
