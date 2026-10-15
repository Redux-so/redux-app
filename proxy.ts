import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ALL_PUBLIC_ROUTES } from "@/lib/public-routes";

const isPublicRoute = createRouteMatcher(ALL_PUBLIC_ROUTES);
const isApiRoute = createRouteMatcher(["/api(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // Proxy runs on the Node.js runtime, where `auth.protect()` treats every
  // request as a page navigation and redirects to sign-in. API callers need a
  // non-OK status instead, so keep the 404 they received under Edge middleware.
  if (isApiRoute(req)) {
    const { userId } = await auth();
    if (!userId) notFound();
    return;
  }

  await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
