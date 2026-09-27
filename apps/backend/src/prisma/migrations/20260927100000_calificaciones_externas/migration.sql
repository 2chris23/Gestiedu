-- LAS NOTAS DE LOS AÑOS CURSADOS EN OTRO PLANTEL
--
-- Para la certificación de calificaciones (1º a 5º año): lo del liceo sale de
-- los expedientes; lo de antes, de aquí. services/certificacion.service.ts

-- CreateTable
CREATE TABLE "calificaciones_externas" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "grado" INTEGER NOT NULL,
    "anoEscolar" TEXT NOT NULL,
    "materia" TEXT NOT NULL,
    "nota" DOUBLE PRECISION,
    "apreciacion" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'F',
    "fecha" TEXT,
    "plantel" TEXT NOT NULL,
    "codigoDelPlantel" TEXT,
    "entidad" TEXT,
    "registradaPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calificaciones_externas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calificaciones_externas_studentId_idx" ON "calificaciones_externas"("studentId");

-- AddForeignKey
ALTER TABLE "calificaciones_externas" ADD CONSTRAINT "calificaciones_externas_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
