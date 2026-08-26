-- Script para limpiar el instituto "Instituto Educativo Demo" que falló en el provisioning

-- 1. Terminar todas las conexiones a la base de datos del tenant
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = 'tenant_instituto_educativo_demo'
AND pid <> pg_backend_pid();

-- 2. Eliminar la base de datos del tenant
DROP DATABASE IF EXISTS tenant_instituto_educativo_demo;

-- 3. Conectarse a la base de datos de la plataforma
\c gestion_escolar_platform

-- 4. Eliminar el instituto de la tabla institutes
DELETE FROM institutes WHERE code = 'IED';

-- Verificar que se eliminó correctamente
SELECT code, name, status FROM institutes;
