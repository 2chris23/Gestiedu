-- BUSCAR Y ORDENAR LA LISTA DE USUARIOS SIN RECORRER LA TABLA ENTERA
--
-- La lista de usuarios busca por nombre, apellido, correo, código y cédula con
-- "contiene" (ILIKE '%...%'), y ordena por apellido y nombre. Sin índices, cada
-- página recorría la tabla entera dos veces (la página y el total). Medido en
-- un liceo de 15.000 personas: buscar 14 ms -> 0,1 ms; ordenar una página
-- 16 ms -> 0,5 ms. Por petición parece poco; con 200 liceos es CPU de la base.
--
-- pg_trgm es una extensión «de confianza» desde PostgreSQL 13: la puede crear
-- el dueño de la base, sin superusuario.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "users_role_lastName_firstName_idx" ON "users" ("role", "lastName", "firstName");
CREATE INDEX IF NOT EXISTS "users_firstName_trgm_idx" ON "users" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_lastName_trgm_idx" ON "users" USING GIN ("lastName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users" USING GIN ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_studentCode_trgm_idx" ON "users" USING GIN ("studentCode" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_id_trgm_idx" ON "users" USING GIN ("id" gin_trgm_ops);
