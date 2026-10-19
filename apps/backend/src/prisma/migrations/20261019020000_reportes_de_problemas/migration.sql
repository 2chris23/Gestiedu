SET lock_timeout = '10s';

-- «Reportar un problema» (18-oct-2026): cualquier persona del liceo lo manda
-- y le llega al admin de su liceo (y, agrupado, al superadmin por la huella
-- de los errores que lleva adjuntos).
CREATE TABLE IF NOT EXISTS "reportes_de_problemas" (
    "id" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "pantalla" TEXT,
    "version" TEXT,
    "aparato" TEXT,
    "huellas" TEXT[] NOT NULL DEFAULT '{}',
    "estado" TEXT NOT NULL DEFAULT 'abierto',
    "respuesta" TEXT,
    "respondidoPor" TEXT,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "actualizadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "reportes_de_problemas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "reportes_de_problemas_autorId_idx" ON "reportes_de_problemas"("autorId");
CREATE INDEX IF NOT EXISTS "reportes_de_problemas_estado_creadoEn_idx" ON "reportes_de_problemas"("estado", "creadoEn" DESC);
