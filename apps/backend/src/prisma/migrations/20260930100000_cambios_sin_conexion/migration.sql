-- LO HECHO SIN CONEXIÓN (2026-09-30)
--
-- cambios_recibidos: cada cambio que llega con su id del teléfono (X-Cambio).
-- El mismo id no se aplica dos veces, aunque se reenvíe días después; y queda
-- el rastro de cuándo se hizo en el teléfono y cuándo llegó.
--
-- cambios_en_espera: lo que llegó pero tiene que decidirlo OTRA persona
-- (notas a una actividad que ya se borró; marcas de un instrumento que se
-- cambió mientras tanto). Se le pregunta a quien borró o cambió.
--
-- Y quién puso cada nota y quién cambió cada asistencia o instrumento, para
-- poder decir «el admin le puso 15 mientras estabas sin conexión».

-- CreateTable
CREATE TABLE "cambios_recibidos" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "estado" INTEGER NOT NULL DEFAULT 0,
    "respuesta" JSONB,
    "hechoEn" TIMESTAMP(3),
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambios_recibidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambios_en_espera" (
    "id" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "decideId" TEXT,
    "tipo" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "motivo" TEXT NOT NULL,
    "hechoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelto" BOOLEAN NOT NULL DEFAULT false,
    "resolucion" TEXT,
    "resueltoPor" TEXT,
    "resueltoEn" TIMESTAMP(3),

    CONSTRAINT "cambios_en_espera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cambios_recibidos_recibidoEn_idx" ON "cambios_recibidos"("recibidoEn");

-- CreateIndex
CREATE INDEX "cambios_en_espera_decideId_resuelto_idx" ON "cambios_en_espera"("decideId", "resuelto");

-- CreateIndex
CREATE INDEX "cambios_en_espera_autorId_resuelto_idx" ON "cambios_en_espera"("autorId", "resuelto");

-- AlterTable
ALTER TABLE "class_activities" ADD COLUMN     "notasPuestasPor" JSONB;

-- AlterTable
ALTER TABLE "daily_attendance" ADD COLUMN     "modificadoPorId" TEXT;

-- AlterTable
ALTER TABLE "instrumentos_de_evaluacion" ADD COLUMN     "cambiadoPor" TEXT;
