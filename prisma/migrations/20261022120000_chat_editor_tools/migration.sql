CREATE TABLE "ChatToolRun" (
  "turnId" TEXT NOT NULL PRIMARY KEY,
  "plan" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatToolRun_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "ChatTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ChatToolStep" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "turnId" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatToolStep_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "ChatToolRun"("turnId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChatToolStep_turnId_index_key" ON "ChatToolStep"("turnId", "index");
