-- AlterTable
ALTER TABLE "Image" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Image_userId_deletedAt_idx" ON "Image"("userId", "deletedAt");
