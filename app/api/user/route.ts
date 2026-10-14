import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/require-user";

export async function GET() {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  return NextResponse.json({ creditBalance: user.creditBalance });
}
