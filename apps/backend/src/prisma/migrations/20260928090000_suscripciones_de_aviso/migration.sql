-- LOS TELÉFONOS QUE RECIBEN AVISOS CON LA APP CERRADA
--
-- Web Push (la PWA) o Firebase (la APK). services/avisos.service.ts

-- CreateTable
CREATE TABLE "suscripciones_de_aviso" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "llaves" JSONB,
    "aparato" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaVez" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suscripciones_de_aviso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suscripciones_de_aviso_destino_key" ON "suscripciones_de_aviso"("destino");

-- CreateIndex
CREATE INDEX "suscripciones_de_aviso_userId_idx" ON "suscripciones_de_aviso"("userId");

-- AddForeignKey
ALTER TABLE "suscripciones_de_aviso" ADD CONSTRAINT "suscripciones_de_aviso_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


