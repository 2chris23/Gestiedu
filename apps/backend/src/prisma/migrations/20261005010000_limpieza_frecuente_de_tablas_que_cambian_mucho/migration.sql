SET lock_timeout = '10s';

-- LAS TABLAS QUE CAMBIAN TODO EL DÍA SE LIMPIAN MÁS A MENUDO (hinchazón)
--
-- En PostgreSQL, cambiar una fila deja la vieja como «muerta» hasta que pasa
-- el autovacuum. Por defecto pasa cuando el 20 % de la tabla está muerta: en
-- `grades` con 1,8 millones de notas, eso son 360.000 filas muertas antes de
-- limpiar. Mientras tanto la tabla y sus índices engordan, y las consultas de
-- la clase en vivo leen más disco del necesario.
--
-- Aquí: al 5 % (y las estadísticas del planificador al 2 %), solo en las que
-- se reescriben sin parar: notas, asistencia, actividades de la clase (sus
-- notas viven en un JSON que se reescribe entero), sesiones, avisos, llaves de
-- sesión (rotan en cada uso) y cambios recibidos. Cambiar estos parámetros
-- toma un candado ligero (no bloquea leer ni escribir) y no reescribe nada.
ALTER TABLE "grades"            SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "daily_attendance"  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "class_activities"  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "class_sessions"    SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "notifications"     SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "refresh_tokens"    SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "cambios_recibidos" SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
