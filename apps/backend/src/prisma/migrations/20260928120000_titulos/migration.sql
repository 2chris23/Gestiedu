-- EL TÍTULO DE BACHILLER DE CADA EGRESADO
--
-- Mención, serial y fecha de expedición. services/graduandos.service.ts

-- CreateTable
CREATE TABLE "titulos" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "mencion" TEXT NOT NULL,
    "serial" TEXT,
    "fechaDeExpedicion" DATE,
    "registradoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "titulos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "titulos_serial_key" ON "titulos"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "titulos_studentId_academicYearId_key" ON "titulos"("studentId", "academicYearId");

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;


