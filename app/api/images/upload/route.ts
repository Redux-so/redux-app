import { createRouteHandler } from "uploadthing/next";
import { appPath } from "@/lib/app-path";
import { libraryUploadRouter } from "@/lib/library-upload-router";

export const maxDuration = 60;

const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const callbackUrl = process.env.VERCEL_ENV === "production" && appUrl
  ? new URL(appPath("/api/images/upload"), appUrl).href
  : undefined;

// UploadThing authenticates callbacks by signature. The router separately
// requires a Redux session before issuing any upload URL.
export const { GET, POST } = createRouteHandler({
  router: libraryUploadRouter,
  config: { callbackUrl, logLevel: "Warning" },
});
