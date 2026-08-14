-- CreateEnum
CREATE TYPE "BusType" AS ENUM ('STANDARD', 'VIP', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('SCHEDULED', 'BOARDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('AVAILABLE', 'HELD', 'BOOKED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "OperatorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "description" TEXT,
    "phone" TEXT,
    "logoUrl" TEXT,
    "licenseNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bus" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "busType" "BusType" NOT NULL DEFAULT 'STANDARD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "fromCity" TEXT NOT NULL,
    "toCity" TEXT NOT NULL,
    "basePrice" DECIMAL(10,2) NOT NULL,
    "distanceKm" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "departureTime" TIMESTAMP(3) NOT NULL,
    "arrivalTime" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatInventory" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "seatNumber" TEXT NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "passengerName" TEXT NOT NULL,
    "passengerPhone" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorProfile_userId_key" ON "OperatorProfile"("userId");

-- CreateIndex
CREATE INDEX "OperatorProfile_isActive_idx" ON "OperatorProfile"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Bus_plateNumber_key" ON "Bus"("plateNumber");

-- CreateIndex
CREATE INDEX "Bus_operatorId_idx" ON "Bus"("operatorId");

-- CreateIndex
CREATE INDEX "Bus_isActive_idx" ON "Bus"("isActive");

-- CreateIndex
CREATE INDEX "Route_fromCity_idx" ON "Route"("fromCity");

-- CreateIndex
CREATE INDEX "Route_toCity_idx" ON "Route"("toCity");

-- CreateIndex
CREATE INDEX "Route_isActive_idx" ON "Route"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Route_fromCity_toCity_key" ON "Route"("fromCity", "toCity");

-- CreateIndex
CREATE INDEX "Trip_operatorId_idx" ON "Trip"("operatorId");

-- CreateIndex
CREATE INDEX "Trip_routeId_idx" ON "Trip"("routeId");

-- CreateIndex
CREATE INDEX "Trip_departureTime_idx" ON "Trip"("departureTime");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "SeatInventory_tripId_status_idx" ON "SeatInventory"("tripId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SeatInventory_tripId_seatNumber_key" ON "SeatInventory"("tripId", "seatNumber");

-- CreateIndex
CREATE INDEX "Booking_tripId_idx" ON "Booking"("tripId");

-- CreateIndex
CREATE INDEX "Booking_passengerId_idx" ON "Booking"("passengerId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- AddForeignKey
ALTER TABLE "OperatorProfile" ADD CONSTRAINT "OperatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatInventory" ADD CONSTRAINT "SeatInventory_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "SeatInventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
