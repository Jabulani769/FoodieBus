-- AlterTable: add shop location to VendorProfile (vendor-owned, mandatory on approve)
ALTER TABLE "VendorProfile" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
