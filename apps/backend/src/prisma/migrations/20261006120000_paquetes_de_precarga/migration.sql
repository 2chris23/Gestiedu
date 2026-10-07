SET lock_timeout = '10s';

-- El paquete de precarga preparado de antemano para cada usuario
-- (Fase B, octubre 2026: «a la velocidad del internet»).
CREATE TABLE IF NOT EXISTS "paquetes_de_precarga" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "contenido" BYTEA NOT NULL,
    "marca" BIGINT NOT NULL,
    "version" TEXT NOT NULL,
    "huella" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "lecturas" INTEGER NOT NULL,
    "armadoEn" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usadoEn" TIMESTAMP(3) WITH TIME ZONE,

    CONSTRAINT "paquetes_de_precarga_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "paquetes_de_precarga_usuarioId_key" ON "paquetes_de_precarga"("usuarioId");
CREATE INDEX IF NOT EXISTS "paquetes_de_precarga_usadoEn_idx" ON "paquetes_de_precarga"("usadoEn");
