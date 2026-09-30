import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { reduxClerkProviderAppearance } from "@/lib/redux-clerk-appearance";
import { geistSans } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Redux",
  description: "AI-powered photo editing",
  icons: {
    icon: [
      {
        url: "/favicon-white.png",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/favicon-black.png",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      { url: "/favicon-black.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={reduxClerkProviderAppearance}>
      <html
        lang="en"
        className={`${geistSans.variable} h-full antialiased`}
      >
        <body className={`${geistSans.className} min-h-full flex flex-col`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
