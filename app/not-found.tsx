"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { LIBRARY_PATH, SIGN_IN_PATH } from "@/constants/app-routes";
import { AUTH_PRIMARY_BTN_CLASS } from "@/lib/brand-colors";
import { SURFACE_BG_MAIN } from "@/lib/surface-colors";

export default function NotFound() {
  const { isLoaded, isSignedIn } = useUser();

  return (
    <div className={`flex min-h-svh flex-1 flex-col ${SURFACE_BG_MAIN}`}>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-[440px] flex-col items-center gap-5 text-center">
          <h1 className="text-[32px] font-medium leading-none tracking-tight text-white sm:text-[36px]">
            404
          </h1>
          <p className="text-[15px] leading-6 text-[#888888]">
            This page couldn&apos;t be found
          </p>
          <nav aria-label="Page navigation" className="flex justify-center">
            <div className="min-w-[104px]">
              {isLoaded ? (
                <Link
                  href={isSignedIn ? LIBRARY_PATH : SIGN_IN_PATH}
                  className={`${AUTH_PRIMARY_BTN_CLASS} px-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white`}
                >
                  {isSignedIn ? "Go to library" : "Sign in"}
                </Link>
              ) : (
                <div className="h-9 w-[104px]" aria-hidden />
              )}
            </div>
          </nav>
        </div>
      </main>
    </div>
  );
}
