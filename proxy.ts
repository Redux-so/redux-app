import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { apiUnauthorizedResponse } from "@/lib/api-error";
import { ALL_PUBLIC_ROUTES } from "@/lib/public-routes";

const isPublicRoute = createRouteMatcher(ALL_PUBLIC_ROUTES);
const isApiRoute = createRouteMatcher(["/api(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // API callers expect JSON errors, not a sign-in redirect or HTML 404.
  if (isApiRoute(req)) {
    const { userId } = await auth();
    if (!userId) return apiUnauthorizedResponse();
    return;
  }

  await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
