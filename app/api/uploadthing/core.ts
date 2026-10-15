import { createUploadthing, type FileRouter } from "uploadthing/next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { enforceFeatureRateLimits } from "@/lib/expensive-route-guard";
import { upsertPrismaUser } from "@/lib/ensure-prisma-user";
import { clerkProfileFromCurrentUser } from "@/lib/require-user";

const f = createUploadthing();

export const ourFileRouter = {
  // awaitServerData: false lets onClientUploadComplete fire immediately after
  // the CDN upload, without waiting for a server webhook callback (which can't
  // reach localhost in dev). The Cloudinary upload + Prisma save are triggered
  // by the client via POST /api/images after onClientUploadComplete fires.
  imageUploader: f(
    {
      "image/jpeg": { maxFileSize: "32MB", maxFileCount: 1 },
      "image/png": { maxFileSize: "32MB", maxFileCount: 1 },
      "image/tiff": { maxFileSize: "32MB", maxFileCount: 1 },
    },
    { awaitServerData: false },
  )
    .middleware(async () => {
      const { userId: clerkId } = await auth();
      if (!clerkId) throw new Error("Unauthorized");

      const clerkUser = await currentUser();
      const user = await upsertPrismaUser(
        clerkProfileFromCurrentUser(clerkId, clerkUser),
      );

      const rateLimited = await enforceFeatureRateLimits(
        user.id,
        "image_upload",
      );
      if (rateLimited) {
        const body = (await rateLimited.json()) as { error?: string };
        throw new Error(body.error ?? "Upload rate limit exceeded");
      }

      return { userId: user.id };
    })
    .onUploadComplete(() => {
      // Row creation + Cloudinary happen in POST /api/images (client, after upload).
      // That route runs BLIP → CLIP embedding in the background (same work as POST /api/images/embed).
      // This webhook has no Prisma image id yet, so embedding cannot start here.
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
