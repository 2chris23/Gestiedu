-- LA REVISIÓN DE UNA MATERIA REPROBADA
--
-- La nota que saca el alumno al presentar en revisión una materia que reprobó
-- en el año. Es su definitiva para la promoción (services/revision.service.ts).

-- CreateTable
CREATE TABLE "notas_de_revision" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "fecha" DATE NOT NULL,
    "registradaPor" TEXT NOT NULL,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_de_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notas_de_revision_academicYearId_idx" ON "notas_de_revision"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "notas_de_revision_studentId_subjectId_academicYearId_key" ON "notas_de_revision"("studentId", "subjectId", "academicYearId");

-- AddForeignKey
ALTER TABLE "notas_de_revision" ADD CONSTRAINT "notas_de_revision_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_de_revision" ADD CONSTRAINT "notas_de_revision_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_de_revision" ADD CONSTRAINT "notas_de_revision_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

