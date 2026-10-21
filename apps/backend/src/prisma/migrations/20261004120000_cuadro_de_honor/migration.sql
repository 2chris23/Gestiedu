-- El cuadro de honor: una foto cada sábado (reglas-del-cuadro.ts, MAPA §8h).
CREATE TABLE "cuadro_de_honor" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "alcance" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "grado" INTEGER NOT NULL,
    "promedio" DECIMAL(5,2) NOT NULL,
    "asistencia" INTEGER NOT NULL,
    "observaciones" INTEGER NOT NULL,
    "puntosNotas" DECIMAL(5,1) NOT NULL,
    "puntosAsistencia" DECIMAL(5,1) NOT NULL,
    "resta" DECIMAL(5,1) NOT NULL,
    "puntaje" DECIMAL(5,1) NOT NULL,
    "puestoLiceo" INTEGER NOT NULL,
    "puestoAno" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuadro_de_honor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cuadro_de_honor_studentId_academicYearId_alcance_fecha_key" ON "cuadro_de_honor"("studentId", "academicYearId", "alcance", "fecha");
CREATE INDEX "cuadro_de_honor_academicYearId_alcance_fecha_idx" ON "cuadro_de_honor"("academicYearId", "alcance", "fecha");
