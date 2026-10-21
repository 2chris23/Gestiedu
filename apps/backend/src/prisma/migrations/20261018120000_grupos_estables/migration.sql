SET lock_timeout = '10s';

-- LOS GRUPOS ESTABLES (octubre 2026)
--
-- A una hora común de la semana, cada estudiante va a SU grupo (fútbol,
-- costura, lectura…), de cualquier sección y año: los Grupos de Creación,
-- Recreación y Producción del MPPE. Una materia «por grupos» tiene sus grupos
-- (con profesor, cupo y turno), su hora común, las solicitudes de los
-- alumnos (que acepta o rechaza el profesor del grupo) y la asistencia de cada
-- encuentro. Tablas nuevas y una columna con valor fijo (no reescribe
-- `subjects`).
-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "porGrupos" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "grupos_estables" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "area" TEXT,
    "profesorId" TEXT,
    "cupo" INTEGER NOT NULL,
    "turno" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grupos_estables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horario_de_grupos" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "turno" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horario_de_grupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_de_grupo" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "momento" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "motivoRechazo" TEXT,
    "revisadoPorId" TEXT,
    "revisadoEn" TIMESTAMP(3),
    "asignadaPorAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_de_grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asistencia_de_grupo" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" TEXT NOT NULL,
    "registradaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asistencia_de_grupo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grupos_estables_profesorId_idx" ON "grupos_estables"("profesorId");

-- CreateIndex
CREATE UNIQUE INDEX "grupos_estables_subjectId_academicYearId_nombre_key" ON "grupos_estables"("subjectId", "academicYearId", "nombre");

-- CreateIndex
CREATE INDEX "horario_de_grupos_subjectId_academicYearId_idx" ON "horario_de_grupos"("subjectId", "academicYearId");

-- CreateIndex
CREATE INDEX "solicitudes_de_grupo_grupoId_estado_idx" ON "solicitudes_de_grupo"("grupoId", "estado");

-- CreateIndex
CREATE INDEX "solicitudes_de_grupo_studentId_subjectId_academicYearId_mom_idx" ON "solicitudes_de_grupo"("studentId", "subjectId", "academicYearId", "momento");

-- CreateIndex
CREATE UNIQUE INDEX "asistencia_de_grupo_grupoId_studentId_fecha_key" ON "asistencia_de_grupo"("grupoId", "studentId", "fecha");

-- AddForeignKey
ALTER TABLE "grupos_estables" ADD CONSTRAINT "grupos_estables_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos_estables" ADD CONSTRAINT "grupos_estables_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos_estables" ADD CONSTRAINT "grupos_estables_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horario_de_grupos" ADD CONSTRAINT "horario_de_grupos_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horario_de_grupos" ADD CONSTRAINT "horario_de_grupos_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_de_grupo" ADD CONSTRAINT "solicitudes_de_grupo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "grupos_estables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_de_grupo" ADD CONSTRAINT "solicitudes_de_grupo_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_de_grupo" ADD CONSTRAINT "solicitudes_de_grupo_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_de_grupo" ADD CONSTRAINT "solicitudes_de_grupo_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_de_grupo" ADD CONSTRAINT "solicitudes_de_grupo_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencia_de_grupo" ADD CONSTRAINT "asistencia_de_grupo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "grupos_estables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencia_de_grupo" ADD CONSTRAINT "asistencia_de_grupo_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- UNA SOLA SOLICITUD VIVA por alumno, materia y momento (PENDIENTE o
-- ACEPTADA). Si dos pestañas piden a la vez, la segunda choca aquí y el
-- servicio responde 409; no se puede decir con Prisma (índice parcial).
CREATE UNIQUE INDEX "solicitudes_de_grupo_una_viva_key" ON "solicitudes_de_grupo"("studentId", "subjectId", "academicYearId", "momento") WHERE "estado" IN ('PENDIENTE', 'ACEPTADA');
