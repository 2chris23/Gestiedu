SET lock_timeout = '10s';

-- Quién aceptó los términos y la privacidad, qué versión y cuándo (19-oct-2026).
-- Es la prueba del consentimiento informado (Constitución art. 28; TSJ 1318/2011).
-- Una fila por persona y versión: aceptar dos veces no repite.
CREATE TABLE IF NOT EXISTS "aceptaciones_legales" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "aceptadaEn" TIMESTAMP(3) NOT NULL,
    "direccion" TEXT,
    "aparato" TEXT,
    CONSTRAINT "aceptaciones_legales_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "aceptaciones_legales_usuarioId_version_key" ON "aceptaciones_legales" ("usuarioId", "version");
