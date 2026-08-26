-- SQL de inicialización para PostgreSQL
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestion_user') THEN
    CREATE ROLE gestion_user LOGIN PASSWORD 'gestion_password';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'gestion_escolar') THEN
    CREATE DATABASE gestion_escolar OWNER gestion_user;
  END IF;
END
$$;
