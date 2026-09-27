-- LA LABOR SOCIAL (las horas comunitarias de los últimos años)
--
-- Cada actividad de cada alumno: qué, dónde, cuántas horas, en qué proyecto.
-- La anotan el admin y el profesor guía. services/labor-social.service.ts

-- CreateTable
CREATE TABLE "actividades_de_labor_social" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "horas" DOUBLE PRECISION NOT NULL,
    "que" TEXT NOT NULL,
    "donde" TEXT,
    "proyecto" TEXT,
    "responsable" TEXT,
    "observaciones" TEXT,
    "culminaElProyecto" BOOLEAN NOT NULL DEFAULT false,
    "grupo" TEXT,
    "registradaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actividades_de_labor_social_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "actividades_de_labor_social_studentId_idx" ON "actividades_de_labor_social"("studentId");

-- CreateIndex
CREATE INDEX "actividades_de_labor_social_academicYearId_idx" ON "actividades_de_labor_social"("academicYearId");

-- AddForeignKey
ALTER TABLE "actividades_de_labor_social" ADD CONSTRAINT "actividades_de_labor_social_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividades_de_labor_social" ADD CONSTRAINT "actividades_de_labor_social_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividades_de_labor_social" ADD CONSTRAINT "actividades_de_labor_social_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
