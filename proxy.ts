import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { apiUnauthorizedResponse } from "@/lib/api-error";
import { clerkContentSecurityPolicyOptions } from "@/lib/content-security-policy";
import { ALL_PUBLIC_ROUTES } from "@/lib/public-routes";
import { isAppPagePath } from "@/lib/last-visited-page";

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

  // Unknown URLs must reach the recovery page even for signed-out visitors.
  // All existing private pages still require authentication below.
  if (isAppPagePath(req.nextUrl.pathname)) await auth.protect();
}, clerkContentSecurityPolicyOptions());

export const config = {
  // With a basePath, the catch-all requires a slash after the prefix.
  matcher: ["/", "/((?!_next|.*\\..*).*)"],
};
