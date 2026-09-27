-- CITAR AL REPRESENTANTE DESDE UNA OBSERVACIÓN
--
-- Cuándo, dónde y para qué; después, si vino y lo que se habló.
-- services/citaciones.service.ts

-- CreateTable
CREATE TABLE "citaciones" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "hora" TEXT NOT NULL,
    "lugar" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "loQueSeHablo" TEXT,
    "citadaPor" TEXT NOT NULL,
    "marcadaPor" TEXT,
    "marcadaEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "citaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "citaciones_studentId_idx" ON "citaciones"("studentId");

-- CreateIndex
CREATE INDEX "citaciones_observationId_idx" ON "citaciones"("observationId");

-- CreateIndex
CREATE INDEX "citaciones_fecha_idx" ON "citaciones"("fecha");

-- AddForeignKey
ALTER TABLE "citaciones" ADD CONSTRAINT "citaciones_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citaciones" ADD CONSTRAINT "citaciones_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


