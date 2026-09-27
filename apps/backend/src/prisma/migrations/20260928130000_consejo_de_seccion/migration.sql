-- EL ACTA DEL CONSEJO DE SECCIÓN
--
-- Por sección y lapso: asistentes, casos de alumnos y acuerdos.
-- services/consejo.service.ts

-- CreateTable
CREATE TABLE "consejos_de_seccion" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "asistentes" JSONB NOT NULL,
    "acuerdosGenerales" TEXT,
    "escritoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consejos_de_seccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos_del_consejo" (
    "id" TEXT NOT NULL,
    "consejoId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "motivos" JSONB,
    "loTratado" TEXT,
    "acuerdo" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "casos_del_consejo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consejos_de_seccion_classroomId_periodId_key" ON "consejos_de_seccion"("classroomId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "casos_del_consejo_consejoId_studentId_key" ON "casos_del_consejo"("consejoId", "studentId");

-- AddForeignKey
ALTER TABLE "consejos_de_seccion" ADD CONSTRAINT "consejos_de_seccion_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consejos_de_seccion" ADD CONSTRAINT "consejos_de_seccion_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_del_consejo" ADD CONSTRAINT "casos_del_consejo_consejoId_fkey" FOREIGN KEY ("consejoId") REFERENCES "consejos_de_seccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casos_del_consejo" ADD CONSTRAINT "casos_del_consejo_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


