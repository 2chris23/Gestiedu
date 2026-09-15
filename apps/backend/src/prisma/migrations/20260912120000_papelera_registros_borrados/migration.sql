-- PAPELERA: nada se borra de verdad.
--
-- Antes de borrar una fila se guarda aquí una copia completa. No cambia ninguna
-- consulta existente: solo deja que un borrado por error se pueda deshacer sin
-- restaurar el respaldo de anoche (que se llevaría por delante todo el día).

CREATE TABLE "registros_borrados" (
    "id" TEXT NOT NULL,
    "tabla" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "contenido" JSONB NOT NULL,
    "borradoPor" TEXT,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_borrados_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registros_borrados_tabla_registroId_idx" ON "registros_borrados"("tabla", "registroId");

CREATE INDEX "registros_borrados_createdAt_idx" ON "registros_borrados"("createdAt");

CREATE INDEX "registros_borrados_tabla_createdAt_idx" ON "registros_borrados"("tabla", "createdAt" DESC);
