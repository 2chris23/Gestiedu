-- LAS MATERIAS QUE SE EVALÚAN CON APRECIACIÓN
--
-- Orientación y Convivencia, Grupos de Creación, Recreación y Producción…
-- no llevan nota de 01 a 20 sino una apreciación («Consolidado», «En
-- proceso»…). No entran en ningún promedio ni en la promoción.
-- services/apreciaciones.service.ts

-- CreateEnum
CREATE TYPE "EvaluacionDeMateria" AS ENUM ('NUMERICA', 'CUALITATIVA');

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN "evaluacion" "EvaluacionDeMateria" NOT NULL DEFAULT 'NUMERICA';

-- CreateTable
CREATE TABLE "apreciaciones" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "periodId" TEXT,
    "momento" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "observacion" TEXT,
    "registradaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apreciaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "apreciaciones_studentId_subjectId_academicYearId_momento_key" ON "apreciaciones"("studentId", "subjectId", "academicYearId", "momento");

-- CreateIndex
CREATE INDEX "apreciaciones_classroomId_subjectId_idx" ON "apreciaciones"("classroomId", "subjectId");

-- AddForeignKey
ALTER TABLE "apreciaciones" ADD CONSTRAINT "apreciaciones_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apreciaciones" ADD CONSTRAINT "apreciaciones_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apreciaciones" ADD CONSTRAINT "apreciaciones_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apreciaciones" ADD CONSTRAINT "apreciaciones_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apreciaciones" ADD CONSTRAINT "apreciaciones_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apreciaciones" ADD CONSTRAINT "apreciaciones_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
