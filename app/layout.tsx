import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { reduxClerkProviderAppearance } from "@/lib/redux-clerk-appearance";
import { geistMono, inter } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Redux",
  description: "AI-powered photo editing",
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
        className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className={`${inter.className} min-h-full flex flex-col`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
