import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import BrandLogo from "@/components/shared/BrandLogo";
import {
  LIBRARY_PATH,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
} from "@/constants/app-routes";
import { AUTH_PRIMARY_BTN_CLASS } from "@/lib/brand-colors";
import { SURFACE_SECONDARY_BTN } from "@/lib/surface-colors";

const LANDING_SECONDARY_BTN = [
  "inline-flex h-10 w-full items-center justify-center rounded-md border border-solid px-4",
  "text-[13px] font-medium leading-none text-white transition-colors sm:w-auto sm:min-w-[140px]",
  SURFACE_SECONDARY_BTN,
].join(" ");

export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    redirect(LIBRARY_PATH);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-[#161616] px-6 py-16">
      <main className="flex w-full max-w-lg flex-col items-center text-center">
        <BrandLogo
          width={260}
          height={260}
          className="h-[72px] w-auto object-contain sm:h-[84px]"
          priority
        />

        <h1 className="mt-8 text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
          AI-powered photo editing
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[#888888]">
          Upload, organize, and edit in your browser — with real-time preview and
          an assistant that helps you refine every shot.
        </p>

        <div className="mt-10 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Link
            href={SIGN_IN_PATH}
            className={`${AUTH_PRIMARY_BTN_CLASS} sm:w-auto sm:min-w-[140px]`}
          >
            Log in
          </Link>
          <Link href={SIGN_UP_PATH} className={LANDING_SECONDARY_BTN}>
            Sign up
          </Link>
        </div>
      </main>
    </div>
  );
}
