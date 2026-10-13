SET lock_timeout = '10s';

-- LA MATERIA PENDIENTE COMO UNA CLASE (octubre 2026)
--
-- Cada pendiente se trabaja en una CLASE (la materia de una sección del grado
-- de origen, en el año en que se cursa) y la evalúa su profesor. Cada momento
-- tiene 1ª y 2ª opción (el «112» de los liceos), su cronograma por año, y la
-- clase puede llevar su plan por momento y sus encuentros con asistencia (el
-- acta de presentación). Tablas nuevas y una columna sin valor fijo: no se
-- reescribe ninguna tabla. La nota del momento pasa a poder ir vacía: el que
-- no se presentó («IN»).
-- AlterTable
ALTER TABLE "materias_pendientes" ADD COLUMN     "claseId" TEXT;

-- AlterTable
ALTER TABLE "evaluaciones_de_pendientes" ALTER COLUMN "nota" DROP NOT NULL;

-- CreateTable
CREATE TABLE "opciones_de_pendientes" (
    "id" TEXT NOT NULL,
    "materiaPendienteId" TEXT NOT NULL,
    "momento" INTEGER NOT NULL,
    "opcion" INTEGER NOT NULL,
    "nota" DOUBLE PRECISION,
    "asistio" BOOLEAN NOT NULL DEFAULT true,
    "justificada" BOOLEAN NOT NULL DEFAULT false,
    "delPlan" BOOLEAN NOT NULL DEFAULT false,
    "fecha" DATE NOT NULL,
    "observaciones" TEXT,
    "registradaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opciones_de_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "momentos_de_pendientes" (
    "id" TEXT NOT NULL,
    "cicloId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "desde1" DATE NOT NULL,
    "hasta1" DATE NOT NULL,
    "desde2" DATE,
    "hasta2" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "momentos_de_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluaciones_del_momento" (
    "id" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "momento" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "peso" INTEGER NOT NULL,
    "instrumento" JSONB,
    "contenidos" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluaciones_del_momento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_de_pendientes" (
    "id" TEXT NOT NULL,
    "evaluacionId" TEXT NOT NULL,
    "materiaPendienteId" TEXT NOT NULL,
    "opcion" INTEGER NOT NULL,
    "nota" DOUBLE PRECISION NOT NULL,
    "desglose" JSONB,
    "registradaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_de_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encuentros_de_pendientes" (
    "id" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "momento" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'TUTORIA',
    "opcion" INTEGER,
    "fecha" DATE NOT NULL,
    "hora" TEXT,
    "aula" TEXT,
    "tema" TEXT,
    "creadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encuentros_de_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asistencias_de_pendientes" (
    "id" TEXT NOT NULL,
    "encuentroId" TEXT NOT NULL,
    "materiaPendienteId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PRESENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asistencias_de_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "opciones_de_pendientes_materiaPendienteId_momento_opcion_key" ON "opciones_de_pendientes"("materiaPendienteId", "momento", "opcion");

-- CreateIndex
CREATE UNIQUE INDEX "momentos_de_pendientes_cicloId_numero_key" ON "momentos_de_pendientes"("cicloId", "numero");

-- CreateIndex
CREATE INDEX "evaluaciones_del_momento_claseId_momento_idx" ON "evaluaciones_del_momento"("claseId", "momento");

-- CreateIndex
CREATE INDEX "notas_de_pendientes_materiaPendienteId_idx" ON "notas_de_pendientes"("materiaPendienteId");

-- CreateIndex
CREATE UNIQUE INDEX "notas_de_pendientes_evaluacionId_materiaPendienteId_opcion_key" ON "notas_de_pendientes"("evaluacionId", "materiaPendienteId", "opcion");

-- CreateIndex
CREATE INDEX "encuentros_de_pendientes_claseId_momento_idx" ON "encuentros_de_pendientes"("claseId", "momento");

-- CreateIndex
CREATE INDEX "asistencias_de_pendientes_materiaPendienteId_idx" ON "asistencias_de_pendientes"("materiaPendienteId");

-- CreateIndex
CREATE UNIQUE INDEX "asistencias_de_pendientes_encuentroId_materiaPendienteId_key" ON "asistencias_de_pendientes"("encuentroId", "materiaPendienteId");

-- CreateIndex
CREATE INDEX "materias_pendientes_claseId_idx" ON "materias_pendientes"("claseId");

-- AddForeignKey
ALTER TABLE "materias_pendientes" ADD CONSTRAINT "materias_pendientes_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "classroom_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opciones_de_pendientes" ADD CONSTRAINT "opciones_de_pendientes_materiaPendienteId_fkey" FOREIGN KEY ("materiaPendienteId") REFERENCES "materias_pendientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opciones_de_pendientes" ADD CONSTRAINT "opciones_de_pendientes_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "momentos_de_pendientes" ADD CONSTRAINT "momentos_de_pendientes_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluaciones_del_momento" ADD CONSTRAINT "evaluaciones_del_momento_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "classroom_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_de_pendientes" ADD CONSTRAINT "notas_de_pendientes_evaluacionId_fkey" FOREIGN KEY ("evaluacionId") REFERENCES "evaluaciones_del_momento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_de_pendientes" ADD CONSTRAINT "notas_de_pendientes_materiaPendienteId_fkey" FOREIGN KEY ("materiaPendienteId") REFERENCES "materias_pendientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encuentros_de_pendientes" ADD CONSTRAINT "encuentros_de_pendientes_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "classroom_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias_de_pendientes" ADD CONSTRAINT "asistencias_de_pendientes_encuentroId_fkey" FOREIGN KEY ("encuentroId") REFERENCES "encuentros_de_pendientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias_de_pendientes" ADD CONSTRAINT "asistencias_de_pendientes_materiaPendienteId_fkey" FOREIGN KEY ("materiaPendienteId") REFERENCES "materias_pendientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Las pendientes que ya existen, a su clase: la de la misma materia y grado
-- de origen en el año en que se cursan; antes la del profesor que la tenía y,
-- si no, la de la misma letra que su sección del año en que la reprobó.
UPDATE "materias_pendientes" mp
SET "claseId" = (
    SELECT cs."id"
    FROM "classroom_subjects" cs
    JOIN "classrooms" c ON c."id" = cs."classroomId"
    WHERE c."academicYearId" = mp."cicloId"
      AND cs."subjectId" = mp."subjectId"
      AND c."grade" = mp."gradoDeOrigen"
    ORDER BY
        (cs."teacherId" IS NOT DISTINCT FROM mp."profesorId") DESC,
        (c."section" = (
            SELECT c2."section"
            FROM "student_classrooms" sc
            JOIN "classrooms" c2 ON c2."id" = sc."classroomId"
            WHERE sc."studentId" = mp."studentId" AND sc."academicYearId" = mp."cicloDeOrigenId"
            LIMIT 1
        )) DESC NULLS LAST,
        c."section" ASC
    LIMIT 1
)
WHERE mp."claseId" IS NULL;

-- El profesor que el cierre puso es el de su clase: deja de ir a mano, así
-- un cambio de profesor en la clase llega también a la pendiente.
UPDATE "materias_pendientes" mp
SET "profesorId" = NULL
FROM "classroom_subjects" cs
WHERE cs."id" = mp."claseId" AND cs."teacherId" = mp."profesorId";
