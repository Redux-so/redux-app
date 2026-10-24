import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { LIBRARY_PATH, SIGN_IN_PATH } from "@/constants/app-routes";

export default async function Home() {
  const { userId } = await auth();
  redirect(userId ? LIBRARY_PATH : SIGN_IN_PATH);
}
