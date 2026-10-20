import type { Metadata } from "next";
import { Suspense } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { reduxClerkProviderAppearance } from "@/lib/redux-clerk-appearance";
import { APPLE_TOUCH_ICON_PATH, FAVICON_PATH } from "@/constants/brand";
import { geistSans } from "@/lib/fonts";
import LastVisitedPage from "@/components/shared/LastVisitedPage";
import "./globals.css";

export const metadata: Metadata = {
  title: "Redux",
  description: "AI-powered photo editing",
  icons: {
    icon: [{ url: FAVICON_PATH, type: "image/png" }],
    apple: [{ url: APPLE_TOUCH_ICON_PATH }],
  },
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
        className={`${geistSans.variable} h-full antialiased`}
      >
        <body className={`${geistSans.className} min-h-full flex flex-col`}>
          <Suspense fallback={null}><LastVisitedPage /></Suspense>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
