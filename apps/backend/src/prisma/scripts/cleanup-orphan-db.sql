-- Script para eliminar la base de datos huérfana tenant_instituto_educativo_demo

-- 1. Terminar todas las conexiones activas
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = 'tenant_instituto_educativo_demo'
AND pid <> pg_backend_pid();

-- 2. Eliminar la base de datos
DROP DATABASE IF EXISTS tenant_instituto_educativo_demo;

-- 3. Verificar que se eliminó
SELECT datname FROM pg_database WHERE datname LIKE 'tenant_%';
