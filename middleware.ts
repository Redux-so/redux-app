import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { ALL_PUBLIC_ROUTES } from "@/lib/public-routes";

const isPublicRoute = createRouteMatcher(ALL_PUBLIC_ROUTES);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
