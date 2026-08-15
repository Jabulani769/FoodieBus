-- CreateEnum
CREATE TYPE "DriverPayoutStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "DriverTripPayout" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "DriverPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverTripPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverTripPayout_tripId_key" ON "DriverTripPayout"("tripId");

-- CreateIndex
CREATE INDEX "DriverTripPayout_driverId_idx" ON "DriverTripPayout"("driverId");

-- CreateIndex
CREATE INDEX "DriverTripPayout_status_idx" ON "DriverTripPayout"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DriverTripPayout_driverId_tripId_key" ON "DriverTripPayout"("driverId", "tripId");

-- AddForeignKey
ALTER TABLE "DriverTripPayout" ADD CONSTRAINT "DriverTripPayout_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverTripPayout" ADD CONSTRAINT "DriverTripPayout_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

