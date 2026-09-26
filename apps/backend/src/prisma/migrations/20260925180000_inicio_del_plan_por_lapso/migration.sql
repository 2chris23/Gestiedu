-- Cuándo empieza el contenido del plan de evaluación en cada lapso.
-- Muchos liceos dejan una o dos semanas (diagnóstico, adaptación) antes de
-- empezar el plan; la Semana 1 del plan es la que contiene esta fecha.
-- Vacía = el plan empieza con el lapso (como hasta ahora).
ALTER TABLE "periods" ADD COLUMN "inicioDelPlan" TIMESTAMP(3);
-- Cómo llama el liceo a esas semanas de antes («Diagnóstico» si no dice nada).
ALTER TABLE "periods" ADD COLUMN "nombreAntesDelPlan" TEXT;
