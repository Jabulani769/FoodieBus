-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profileImage" TEXT;

-- AlterTable
ALTER TABLE "VendorProfile" ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "cuisineType" TEXT,
ADD COLUMN     "deliveryTime" INTEGER;
