-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "avoidWords" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "examplePosts" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "handle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "slangPhrases" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "toneChips" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "voiceStrength" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "Caption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creatorId" TEXT,
    "variantId" TEXT,
    "topic" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Caption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "href" TEXT NOT NULL DEFAULT '/',
    "readAt" TIMESTAMP(3),
    "ref" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Caption_userId_creatorId_idx" ON "Caption"("userId", "creatorId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_ref_idx" ON "Notification"("userId", "ref");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_userId_key" ON "NotificationSetting"("userId");

-- AddForeignKey
ALTER TABLE "Caption" ADD CONSTRAINT "Caption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caption" ADD CONSTRAINT "Caption_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caption" ADD CONSTRAINT "Caption_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CreativeVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

