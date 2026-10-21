CREATE TABLE "ChatTurn" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "imageId" TEXT NOT NULL,
    "userText" TEXT NOT NULL,
    "assistantText" TEXT NOT NULL DEFAULT '',
    "attachmentUrl" TEXT,
    "attachmentPublicId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'agent',
    "status" TEXT NOT NULL DEFAULT 'streaming',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatTurn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatTurn_sequence_key" ON "ChatTurn"("sequence");
CREATE INDEX "ChatTurn_imageId_sequence_idx" ON "ChatTurn"("imageId", "sequence");
ALTER TABLE "ChatTurn" ADD CONSTRAINT "ChatTurn_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;
