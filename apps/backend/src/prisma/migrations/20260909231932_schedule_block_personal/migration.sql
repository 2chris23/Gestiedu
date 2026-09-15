-- AlterTable
ALTER TABLE "schedule_blocks" ADD COLUMN     "teacherId" TEXT,
ADD COLUMN     "title" TEXT,
ALTER COLUMN "classroomId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "schedule_blocks_teacherId_dayOfWeek_idx" ON "schedule_blocks"("teacherId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un bloque tiene que pertenecer a alguien: o es de una sección (CLASS,
-- posiblemente sin materia asignada aún, como los BREAK) o es la hora
-- personal de un profesor (PERSONAL). Nunca puede quedar huérfano, que es
-- el riesgo de tener las dos formas en la misma tabla.
ALTER TABLE "schedule_blocks"
  ADD CONSTRAINT "schedule_blocks_owner_check"
  CHECK ("classroomId" IS NOT NULL OR "teacherId" IS NOT NULL);
