-- BECAS Y DESCUENTOS (2026-10-01)
--
-- Cada alumno puede tener su descuento (beca, hijo de docente…) en un ciclo.
-- El de hermanos y la mora son del ciclo (ajustes_de_pagos_del_ciclo).

-- AlterTable
ALTER TABLE "student_payment_plans" ADD COLUMN "descuentoPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "descuentoMotivo" TEXT;
