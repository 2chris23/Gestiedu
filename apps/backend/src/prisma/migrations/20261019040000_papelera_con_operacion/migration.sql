SET lock_timeout = '10s';

-- La papelera con «Restaurar» (19-oct-2026). Borrar un alumno son decenas de
-- filas (sus notas, su asistencia…): `operacion` las junta para devolverlas
-- de una vez, y `orden` dice en qué orden entraron. Las filas de antes no
-- tienen operación: se agrupan por quién, desde dónde y el mismo segundo.
ALTER TABLE "registros_borrados" ADD COLUMN IF NOT EXISTS "operacion" TEXT;
ALTER TABLE "registros_borrados" ADD COLUMN IF NOT EXISTS "orden" BIGSERIAL;
CREATE INDEX IF NOT EXISTS "registros_borrados_operacion_idx" ON "registros_borrados" ("operacion");
