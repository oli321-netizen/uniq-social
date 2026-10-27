-- AlterTable
ALTER TABLE "Hook" ADD COLUMN "projectId" TEXT;

-- CreateTable
CREATE TABLE "HookProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creatorId" TEXT,
    "fileName" TEXT NOT NULL DEFAULT '',
    "storageKey" TEXT NOT NULL DEFAULT '',
    "durationSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transcript" TEXT NOT NULL DEFAULT '',
    "wordsJson" TEXT NOT NULL DEFAULT '[]',
    "segmentsJson" TEXT NOT NULL DEFAULT '[]',
    "styleJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HookProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HookProject_userId_idx" ON "HookProject"("userId");

-- CreateIndex
CREATE INDEX "Hook_projectId_idx" ON "Hook"("projectId");

-- AddForeignKey
ALTER TABLE "HookProject" ADD CONSTRAINT "HookProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HookProject" ADD CONSTRAINT "HookProject_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hook" ADD CONSTRAINT "Hook_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "HookProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
