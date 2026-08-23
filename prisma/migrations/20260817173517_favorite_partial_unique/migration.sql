-- DropIndex
DROP INDEX "Favorite_userId_dishId_vendorId_key";

-- Partial unique indexes (Postgres treats NULLs as distinct in plain UNIQUE,
-- so per-kind uniqueness is enforced with partial indexes).
CREATE UNIQUE INDEX "Favorite_userId_dishId_key" ON "Favorite"("userId", "dishId") WHERE "dishId" IS NOT NULL;
CREATE UNIQUE INDEX "Favorite_userId_vendorId_key" ON "Favorite"("userId", "vendorId") WHERE "vendorId" IS NOT NULL;
