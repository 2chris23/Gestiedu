-- LA CONFIGURACIÓN DE PAGOS DE CADA CICLO (2026-10-01)
--
-- payment_settings era una sola fila para todo el liceo: subir la cuota el año
-- que viene recalculaba los ciclos pasados con la cuota nueva. Cada ciclo
-- guarda ahora la suya (ajustes_de_pagos_del_ciclo), y los ciclos que ya
-- tienen pagos se quedan con la de hoy, que es con la que se cobraron.
--
-- De paso, lo nuevo del liceo para los ciclos que vengan: descuento por
-- hermanos, recargo por mora y el recordatorio antes del vencimiento.

-- AlterTable
ALTER TABLE "payment_settings" ADD COLUMN "descuentoHermanosPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "moraTipo" TEXT NOT NULL DEFAULT 'NINGUNA',
ADD COLUMN "moraValor" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "moraDiasDespues" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "recordatorioDiasAntes" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "ajustes_de_pagos_del_ciclo" (
    "academicYearId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "dueMode" TEXT NOT NULL DEFAULT 'SAME_DAY',
    "dueDay" INTEGER NOT NULL DEFAULT 5,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "acceptedCurrencies" TEXT NOT NULL DEFAULT 'BOTH',
    "feeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "enrollmentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "enrollmentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "methods" JSONB NOT NULL DEFAULT '["Efectivo", "Pago Móvil", "Transferencia", "Zelle"]',
    "descuentoHermanosPct" INTEGER NOT NULL DEFAULT 0,
    "moraTipo" TEXT NOT NULL DEFAULT 'NINGUNA',
    "moraValor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "moraDiasDespues" INTEGER NOT NULL DEFAULT 0,
    "recordatorioDiasAntes" INTEGER NOT NULL DEFAULT 3,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ajustes_de_pagos_del_ciclo_pkey" PRIMARY KEY ("academicYearId")
);

-- AddForeignKey
ALTER TABLE "ajustes_de_pagos_del_ciclo" ADD CONSTRAINT "ajustes_de_pagos_del_ciclo_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Los ciclos que ya tienen pagos se quedan con la configuración con la que se cobraron.
INSERT INTO "ajustes_de_pagos_del_ciclo" (
    "academicYearId", "frequency", "dueMode", "dueDay", "graceDays", "baseCurrency", "acceptedCurrencies",
    "feeAmount", "enrollmentEnabled", "enrollmentAmount", "methods", "updatedById", "updatedAt"
)
SELECT ay."id", ps."frequency", ps."dueMode", ps."dueDay", ps."graceDays", ps."baseCurrency", ps."acceptedCurrencies",
       ps."feeAmount", ps."enrollmentEnabled", ps."enrollmentAmount", ps."methods", ps."updatedById", CURRENT_TIMESTAMP
FROM "academic_years" ay
CROSS JOIN "payment_settings" ps
WHERE ps."id" = 'liceo'
  AND EXISTS (SELECT 1 FROM "payments" p WHERE p."academicYearId" = ay."id")
ON CONFLICT ("academicYearId") DO NOTHING;
