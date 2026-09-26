-- EVALUAR A UN ALUMNO DE OTRA FORMA EN UNA ACTIVIDAD
-- Ej.: un alumno que no puede hacer deporte se evalúa con el cuaderno. Por
-- alumno: { "<studentId>": { "metodo": "Cuaderno", "motivo": "..." } }.
-- Su nota va en `scores` como la de los demás y cuenta igual.
ALTER TABLE "class_activities" ADD COLUMN "evaluadoDeOtraForma" JSONB;
