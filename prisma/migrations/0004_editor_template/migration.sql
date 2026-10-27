-- CreateTable
CREATE TABLE "EditorTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "docJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EditorTemplate_userId_idx" ON "EditorTemplate"("userId");

-- AddForeignKey
ALTER TABLE "EditorTemplate" ADD CONSTRAINT "EditorTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
