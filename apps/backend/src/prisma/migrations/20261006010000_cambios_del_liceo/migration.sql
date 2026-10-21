SET lock_timeout = '10s';

-- Cada cambio del liceo, para que los teléfonos bajen solo lo que cambió
-- (`plugins/avisar-cambios.ts`, `POST /api/precarga/cambios`).
CREATE TABLE IF NOT EXISTS "cambios_del_liceo" (
    "id" SERIAL NOT NULL,
    "momento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recurso" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "destinatarios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "todos" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "cambios_del_liceo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cambios_del_liceo_momento_idx" ON "cambios_del_liceo"("momento");
