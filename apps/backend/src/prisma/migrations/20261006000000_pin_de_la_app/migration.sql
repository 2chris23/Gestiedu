SET lock_timeout = '10s';

-- EL PIN DE LA APP (octubre 2026)
--
-- Para teléfonos sin ningún bloqueo de pantalla: la pantalla de bloqueo de la
-- app pide un PIN de 4 números. Se guarda su resumen (bcrypt), nunca el PIN.
-- Lo crea la persona la primera vez; después solo un admin lo cambia o lo
-- resetea (`pinVersion` sube y el teléfono tira su copia). Columnas nuevas con
-- valor fijo: no reescribe la tabla.
ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "pinDeLaApp" TEXT,
    ADD COLUMN IF NOT EXISTS "pinVersion" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "pinFallos" INTEGER NOT NULL DEFAULT 0;
