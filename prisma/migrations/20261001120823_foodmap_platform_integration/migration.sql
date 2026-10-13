-- CreateEnum
CREATE TYPE "DishOptionGroupType" AS ENUM ('SINGLE', 'MULTI');

-- AlterTable
ALTER TABLE "FoodOrder" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "estimatedReadyAt" TIMESTAMP(3),
ADD COLUMN     "prepMinutes" INTEGER,
ADD COLUMN     "readyAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FoodOrderItem" ADD COLUMN     "lineTotal" DECIMAL(10,2),
ADD COLUMN     "selectedOptions" JSONB;

-- AlterTable
ALTER TABLE "VendorProfile" ADD COLUMN     "deliveryRadiusKm" DOUBLE PRECISION DEFAULT 5,
ADD COLUMN     "isPaused" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VendorOperatingHours" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorOperatingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishOptionGroup" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DishOptionGroupType" NOT NULL DEFAULT 'SINGLE',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DishOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DishOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorOperatingHours_vendorId_idx" ON "VendorOperatingHours"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorOperatingHours_vendorId_dayOfWeek_key" ON "VendorOperatingHours"("vendorId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "DishOptionGroup_dishId_idx" ON "DishOptionGroup"("dishId");

-- CreateIndex
CREATE INDEX "DishOptionGroup_dishId_isActive_idx" ON "DishOptionGroup"("dishId", "isActive");

-- CreateIndex
CREATE INDEX "DishOption_groupId_idx" ON "DishOption"("groupId");

-- CreateIndex
CREATE INDEX "DishOption_groupId_isActive_idx" ON "DishOption"("groupId", "isActive");

-- CreateIndex
CREATE INDEX "VendorProfile_isPaused_idx" ON "VendorProfile"("isPaused");

-- AddForeignKey
ALTER TABLE "VendorOperatingHours" ADD CONSTRAINT "VendorOperatingHours_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishOptionGroup" ADD CONSTRAINT "DishOptionGroup_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishOption" ADD CONSTRAINT "DishOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DishOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
