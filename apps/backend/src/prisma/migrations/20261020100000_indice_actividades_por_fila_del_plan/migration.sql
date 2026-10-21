SET lock_timeout = '10s';

-- Guardar el plan de evaluación o su instrumento busca las actividades de una
-- fila del plan (`planRowId`): sin índice, PostgreSQL recorría la tabla
-- entera de actividades del liceo en cada guardado (auditoría de
-- rendimiento, 20-oct-2026). La tabla es de miles de filas, no de millones:
-- el índice se crea en segundos, y con el tope de arriba no cuelga a nadie.
CREATE INDEX IF NOT EXISTS "class_activities_planRowId_idx" ON "class_activities" ("planRowId");
