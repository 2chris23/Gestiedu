-- LA LLAVE QUE GUARDA UN TELÉFONO PARA VOLVER A ENTRAR
--
-- Se crea DESPUÉS de una entrada con correo y contraseña, en ese teléfono y
-- solo si su dueño lo pide. Aquí se guarda únicamente el resumen: quien se
-- lleve la base de datos no se lleva ninguna llave.

CREATE TABLE "device_keys" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "device_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_keys_tokenHash_key" ON "device_keys"("tokenHash");
CREATE INDEX "device_keys_userId_idx" ON "device_keys"("userId");
CREATE INDEX "device_keys_expiresAt_idx" ON "device_keys"("expiresAt");

ALTER TABLE "device_keys"
    ADD CONSTRAINT "device_keys_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
