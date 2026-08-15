-- CreateEnum
CREATE TYPE "RatingEntityType" AS ENUM ('TRIP', 'DISH', 'OPERATOR', 'VENDOR');

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "RatingEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rating_entityType_entityId_idx" ON "Rating"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_entityType_entityId_key" ON "Rating"("userId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

