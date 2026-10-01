-- RECORDAR Y REPORTAR PAGOS (2026-10-01)
--
-- recordatorios_de_cuota: cada aviso de «tu cuota vence en N días», una sola
-- vez (clave única), aunque haya varios procesos.
-- pagos_reportados: el representante dice que pagó, con la captura; el admin
-- confirma (y entonces es un pago) o rechaza con motivo.

-- CreateTable
CREATE TABLE "recordatorios_de_cuota" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "installmentKey" TEXT NOT NULL,
    "enviadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordatorios_de_cuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_reportados" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "reportadoPorId" TEXT NOT NULL,
    "installmentKeys" JSONB NOT NULL,
    "moneda" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "tasa" DECIMAL(14,4),
    "metodo" TEXT NOT NULL,
    "referencia" TEXT,
    "fechaDePago" DATE NOT NULL,
    "comprobanteId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "motivoRechazo" TEXT,
    "paymentId" TEXT,
    "revisadoPorId" TEXT,
    "revisadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_reportados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recordatorios_de_cuota_studentId_academicYearId_installmentK_key" ON "recordatorios_de_cuota"("studentId", "academicYearId", "installmentKey");

-- CreateIndex
CREATE INDEX "pagos_reportados_estado_idx" ON "pagos_reportados"("estado");

-- CreateIndex
CREATE INDEX "pagos_reportados_studentId_idx" ON "pagos_reportados"("studentId");
