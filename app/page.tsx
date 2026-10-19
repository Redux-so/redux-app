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

const LANDING_PRIMARY_BTN = [
  AUTH_PRIMARY_BTN_CLASS,
  "!h-11 text-[14px] sm:w-auto sm:min-w-[152px]",
].join(" ");

const LANDING_SECONDARY_BTN = [
  "inline-flex h-11 w-full items-center justify-center rounded-md border border-solid px-5",
  "text-[14px] font-medium leading-none text-white transition-colors sm:w-auto sm:min-w-[152px]",
  SURFACE_SECONDARY_BTN,
].join(" ");

export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    redirect(LIBRARY_PATH);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-[#161616] px-7 py-[4.5rem] sm:px-8">
      <main className="flex w-full max-w-xl flex-col items-center text-center">
        <BrandLogo
          width={260}
          height={260}
          className="h-[80px] w-auto object-contain sm:h-[92px]"
          priority
        />

        <h1 className="mt-9 max-w-md text-[19px] leading-relaxed text-[#888888] sm:mt-10 sm:text-[20px]">
          Agentic photo editing platform
        </h1>

        <div className="mt-11 flex w-full max-w-sm flex-col gap-4 sm:mt-12 sm:max-w-none sm:flex-row sm:justify-center">
          <Link href={SIGN_IN_PATH} className={LANDING_PRIMARY_BTN}>
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
