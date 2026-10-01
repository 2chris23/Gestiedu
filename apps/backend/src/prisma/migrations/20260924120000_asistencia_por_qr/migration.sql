-- ASISTENCIA POR QR
--
-- El pase de lista que abre el profesor (con su faro: dónde estaba su
-- teléfono), cada intento de un alumno con su teléfono y su ubicación, y el
-- teléfono que cada alumno tiene registrado para pasar asistencia.
-- La asistencia en sí sigue en daily_attendance, igual que la de a mano.

-- CreateTable
CREATE TABLE "pases_de_lista" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "abiertoPorId" TEXT NOT NULL,
    "abiertoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aTiempoHasta" TIMESTAMP(3) NOT NULL,
    "caducaEn" TIMESTAMP(3) NOT NULL,
    "cerradoEn" TIMESTAMP(3),
    "esCorreccion" BOOLEAN NOT NULL DEFAULT false,
    "secreto" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "precision" DOUBLE PRECISION,

    CONSTRAINT "pases_de_lista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_asistencia_qr" (
    "id" TEXT NOT NULL,
    "paseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "forma" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "motivo" TEXT,
    "asistencia" TEXT,
    "asistenciaAnterior" TEXT,
    "aparatoHash" TEXT,
    "aparato" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "precision" DOUBLE PRECISION,
    "distancia" DOUBLE PRECISION,
    "ubicacionFalsa" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltoPorId" TEXT,
    "resueltoEn" TIMESTAMP(3),

    CONSTRAINT "registros_asistencia_qr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aparatos_de_alumnos" (
    "studentId" TEXT NOT NULL,
    "aparatoHash" TEXT NOT NULL,
    "descripcion" TEXT,
    "registradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aparatos_de_alumnos_pkey" PRIMARY KEY ("studentId")
);

-- CreateIndex
CREATE INDEX "pases_de_lista_classroomId_subjectId_fecha_idx" ON "pases_de_lista"("classroomId", "subjectId", "fecha");

-- CreateIndex
CREATE INDEX "pases_de_lista_abiertoPorId_cerradoEn_idx" ON "pases_de_lista"("abiertoPorId", "cerradoEn");

-- CreateIndex
CREATE INDEX "registros_asistencia_qr_paseId_idx" ON "registros_asistencia_qr"("paseId");

-- CreateIndex
CREATE INDEX "registros_asistencia_qr_studentId_idx" ON "registros_asistencia_qr"("studentId");

-- CreateIndex
CREATE INDEX "registros_asistencia_qr_aparatoHash_idx" ON "registros_asistencia_qr"("aparatoHash");

-- CreateIndex
CREATE UNIQUE INDEX "aparatos_de_alumnos_aparatoHash_key" ON "aparatos_de_alumnos"("aparatoHash");

-- AddForeignKey
ALTER TABLE "pases_de_lista" ADD CONSTRAINT "pases_de_lista_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pases_de_lista" ADD CONSTRAINT "pases_de_lista_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pases_de_lista" ADD CONSTRAINT "pases_de_lista_abiertoPorId_fkey" FOREIGN KEY ("abiertoPorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_asistencia_qr" ADD CONSTRAINT "registros_asistencia_qr_paseId_fkey" FOREIGN KEY ("paseId") REFERENCES "pases_de_lista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_asistencia_qr" ADD CONSTRAINT "registros_asistencia_qr_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparatos_de_alumnos" ADD CONSTRAINT "aparatos_de_alumnos_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

