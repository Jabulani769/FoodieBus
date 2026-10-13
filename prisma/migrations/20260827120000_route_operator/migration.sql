-- Add operator ownership to bus routes.
-- A system operator is created so existing (pre-ownership) routes have a valid owner.

-- AlterTable: add nullable operatorId
ALTER TABLE "Route" ADD COLUMN "operatorId" TEXT;

-- Create a system operator user + profile to own pre-existing routes
INSERT INTO "User" ("id", "email", "phone", "passwordHash", "role", "fullName", "createdAt", "updatedAt")
VALUES (
  'f0000000-0000-0000-0000-000000000001',
  'system-route-owner@foodiebus.local',
  '+2650000000001',
  'system-operator-placeholder-hash',
  'SUPER_ADMIN',
  'System Route Owner',
  now(),
  now()
);

INSERT INTO "OperatorProfile" ("id", "userId", "businessName", "isActive", "createdAt", "updatedAt")
VALUES (
  'f0000000-0000-0000-0000-000000000002',
  'f0000000-0000-0000-0000-000000000001',
  'System Route Owner',
  true,
  now(),
  now()
);

-- Backfill existing rows before enforcing NOT NULL
UPDATE "Route" SET "operatorId" = 'f0000000-0000-0000-0000-000000000002';

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "OperatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: enforce NOT NULL
ALTER TABLE "Route" ALTER COLUMN "operatorId" SET NOT NULL;

-- DropIndex: old city-pair unique
DROP INDEX "Route_fromCity_toCity_key";

-- CreateIndex: operator-scoped unique city pair
CREATE UNIQUE INDEX "Route_operatorId_fromCity_toCity_key" ON "Route"("operatorId", "fromCity", "toCity");

-- CreateIndex
CREATE INDEX "Route_operatorId_idx" ON "Route"("operatorId");
