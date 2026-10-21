SET lock_timeout = '10s';

-- LOS MOVIMIENTOS RECURRENTES (octubre 2026)
--
-- Plantillas de ingresos y egresos que se repiten (el internet de cada mes, el
-- sueldo de la cocinera): se anotan de un toque desde «Nuevo movimiento». Viven
-- en la fila única de los ajustes de pagos, como las categorías y las áreas.
ALTER TABLE "payment_settings" ADD COLUMN "recurrentes" JSONB NOT NULL DEFAULT '[]';
