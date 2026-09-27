-- EL TRASLADO Y EL RETIRO
--
-- La fecha y el motivo del retiro (los cuenta la matrícula), el plantel de
-- origen del que llega trasladado, y las notas de los lapsos que cursó en
-- el otro liceo este año. services/traslado.service.ts

-- AlterTable
ALTER TABLE "student_classrooms" ADD COLUMN     "motivoDeRetiro" TEXT,
ADD COLUMN     "plantelDeOrigen" TEXT,
ADD COLUMN     "retiradoEl" DATE;
-- CreateTable
CREATE TABLE "notas_de_otro_plantel" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "nota" DOUBLE PRECISION NOT NULL,
    "materiaDeOrigen" TEXT NOT NULL,
    "plantel" TEXT NOT NULL,
    "codigoDelPlantel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notas_de_otro_plantel_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "notas_de_otro_plantel_studentId_idx" ON "notas_de_otro_plantel"("studentId");
-- CreateIndex
CREATE UNIQUE INDEX "notas_de_otro_plantel_studentId_periodId_subjectId_key" ON "notas_de_otro_plantel"("studentId", "periodId", "subjectId");
-- AddForeignKey
ALTER TABLE "notas_de_otro_plantel" ADD CONSTRAINT "notas_de_otro_plantel_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "notas_de_otro_plantel" ADD CONSTRAINT "notas_de_otro_plantel_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "notas_de_otro_plantel" ADD CONSTRAINT "notas_de_otro_plantel_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
