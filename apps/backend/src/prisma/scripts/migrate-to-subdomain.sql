-- Script de migración manual para Platform DB
-- Migra de sistema de puertos a subdominios

-- 1. Verificar institutos existentes
SELECT id, name, slug, port, "isLocal", subdomain, domain 
FROM institutes;

-- 2. Actualizar institutos existentes con subdomain basado en slug
UPDATE institutes 
SET subdomain = slug 
WHERE subdomain IS NULL;

-- 3. Agregar columna environment si no existe
ALTER TABLE institutes 
ADD COLUMN IF NOT EXISTS environment VARCHAR(255) DEFAULT 'development';

-- 4. Renombrar domain a customDomain
ALTER TABLE institutes 
RENAME COLUMN domain TO "customDomain";

-- 5. Eliminar columnas obsoletas
ALTER TABLE institutes 
DROP COLUMN IF EXISTS port,
DROP COLUMN IF EXISTS "isLocal";

-- 6. Hacer subdomain NOT NULL
ALTER TABLE institutes 
ALTER COLUMN subdomain SET NOT NULL;

-- 7. Actualizar índices
DROP INDEX IF EXISTS "institutes_port_idx";
CREATE INDEX IF NOT EXISTS "institutes_subdomain_idx" ON institutes(subdomain);
CREATE INDEX IF NOT EXISTS "institutes_environment_idx" ON institutes(environment);

-- 8. Verificar resultado
SELECT id, name, slug, subdomain, "customDomain", environment, status 
FROM institutes;
