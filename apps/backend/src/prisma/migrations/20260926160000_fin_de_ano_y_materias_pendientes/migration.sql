-- EL FIN DEL AÑO ESCOLAR, POR PASOS, Y LAS MATERIAS PENDIENTES DE VERDAD
--
-- - academic_records: la condición que sugería el sistema, el motivo si el
--   admin decidió otra cosa o la corrigió después, y el egreso (5to año).
-- - notas_de_revision.componentes: la revisión dividida como la haga el liceo.
-- - decisiones_de_fin_de_ano: lo que decide el admin antes de cerrar, con motivo.
-- - materias_pendientes y evaluaciones_de_pendientes: la materia que se
--   arrastra al año siguiente y cada momento en que se evalúa.
-- services/fin-de-ano.service.ts, services/materias-pendientes.service.ts

-- AlterTable
ALTER TABLE "academic_records" ADD COLUMN     "condicionSugerida" TEXT,
ADD COLUMN     "corregidoEl" TIMESTAMP(3),
ADD COLUMN     "decididaPor" TEXT,
ADD COLUMN     "egreso" TEXT,
ADD COLUMN     "motivo" TEXT;

-- AlterTable
ALTER TABLE "notas_de_revision" ADD COLUMN     "componentes" JSONB;

-- CreateTable
CREATE TABLE "decisiones_de_fin_de_ano" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "condicion" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "decididaPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decisiones_de_fin_de_ano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materias_pendientes" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "gradoDeOrigen" INTEGER NOT NULL,
    "cicloDeOrigenId" TEXT NOT NULL,
    "notaDeOrigen" DOUBLE PRECISION,
    "cicloId" TEXT NOT NULL,
    "profesorId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "notaFinal" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materias_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluaciones_de_pendientes" (
    "id" TEXT NOT NULL,
    "materiaPendienteId" TEXT NOT NULL,
    "momento" INTEGER NOT NULL,
    "nota" DOUBLE PRECISION NOT NULL,
    "fecha" DATE NOT NULL,
    "observaciones" TEXT,
    "registradaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluaciones_de_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "decisiones_de_fin_de_ano_academicYearId_studentId_key" ON "decisiones_de_fin_de_ano"("academicYearId", "studentId");

-- CreateIndex
CREATE INDEX "materias_pendientes_cicloId_idx" ON "materias_pendientes"("cicloId");

-- CreateIndex
CREATE INDEX "materias_pendientes_profesorId_idx" ON "materias_pendientes"("profesorId");

-- CreateIndex
CREATE UNIQUE INDEX "materias_pendientes_studentId_subjectId_cicloDeOrigenId_key" ON "materias_pendientes"("studentId", "subjectId", "cicloDeOrigenId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluaciones_de_pendientes_materiaPendienteId_momento_key" ON "evaluaciones_de_pendientes"("materiaPendienteId", "momento");

-- AddForeignKey
ALTER TABLE "decisiones_de_fin_de_ano" ADD CONSTRAINT "decisiones_de_fin_de_ano_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisiones_de_fin_de_ano" ADD CONSTRAINT "decisiones_de_fin_de_ano_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materias_pendientes" ADD CONSTRAINT "materias_pendientes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materias_pendientes" ADD CONSTRAINT "materias_pendientes_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materias_pendientes" ADD CONSTRAINT "materias_pendientes_cicloDeOrigenId_fkey" FOREIGN KEY ("cicloDeOrigenId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materias_pendientes" ADD CONSTRAINT "materias_pendientes_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materias_pendientes" ADD CONSTRAINT "materias_pendientes_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluaciones_de_pendientes" ADD CONSTRAINT "evaluaciones_de_pendientes_materiaPendienteId_fkey" FOREIGN KEY ("materiaPendienteId") REFERENCES "materias_pendientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluaciones_de_pendientes" ADD CONSTRAINT "evaluaciones_de_pendientes_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
