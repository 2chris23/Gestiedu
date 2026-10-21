SET lock_timeout = '10s';

-- LOS ÍNDICES DE BÚSQUEDA, TAMBIÉN EN LOS LICEOS DE LA BASE COMPARTIDA
--
-- `20260923120000_busqueda_de_usuarios` los crea, pero un liceo pasado a su
-- esquema de la base compartida quedó sin ellos (medido en
-- instituto-testing: 0 de 5; `deriva-del-esquema.ts` los pedía). Sin ellos,
-- buscar en Usuarios recorre la tabla entera.
--
-- Es la misma cuenta, repetida sin miedo: IF NOT EXISTS no toca a quien ya
-- los tiene. `pg_trgm` vive en pg_catalog (lo deja ahí el alta del liceo), así
-- que `gin_trgm_ops` se encuentra desde el esquema de cualquier liceo.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "users_firstName_trgm_idx" ON "users" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_lastName_trgm_idx" ON "users" USING GIN ("lastName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users" USING GIN ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_studentCode_trgm_idx" ON "users" USING GIN ("studentCode" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_id_trgm_idx" ON "users" USING GIN ("id" gin_trgm_ops);
