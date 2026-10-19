SET lock_timeout = '10s';

-- «Descargar todos mis datos» (19-oct-2026): la garantía de Cristian de que,
-- pase lo que pase con Gestiedu, el liceo se queda con todo lo suyo. Cada
-- pedido se arma de fondo en un ZIP con contraseña (la elige el director y no
-- se guarda) y caduca a las 24 h.
CREATE TABLE IF NOT EXISTS "exportaciones" (
    "id" TEXT NOT NULL,
    "pedidoPor" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ARMANDO',
    "progreso" INTEGER NOT NULL DEFAULT 0,
    "paso" TEXT,
    "archivo" TEXT,
    "bytes" BIGINT,
    "error" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listaEn" TIMESTAMP(3),
    "caducaEn" TIMESTAMP(3),
    CONSTRAINT "exportaciones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "exportaciones_creadaEn_idx" ON "exportaciones" ("creadaEn");
