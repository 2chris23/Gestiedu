-- AlterTable
ALTER TABLE "institutes" ADD COLUMN IF NOT EXISTS "databaseSchema" TEXT;

-- DropIndex
DROP INDEX IF EXISTS "institutes_databaseName_key";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "institutes_databaseSchema_idx" ON "institutes"("databaseSchema");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "institutes_databaseName_databaseSchema_key" ON "institutes"("databaseName", "databaseSchema");
