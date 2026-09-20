-- AlterTable
ALTER TABLE "classrooms" ADD COLUMN "shift" TEXT NOT NULL DEFAULT 'MANANA';

-- CreateIndex
CREATE INDEX "classrooms_shift_idx" ON "classrooms"("shift");
