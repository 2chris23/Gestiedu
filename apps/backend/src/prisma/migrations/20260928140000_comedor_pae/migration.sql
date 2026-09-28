-- EL COMEDOR (PAE): se activa o no, como los pagos
--
-- Raciones recibidas y servidas por día y comida. services/pae.service.ts

-- CreateTable
CREATE TABLE "pae_config" (
    "id" TEXT NOT NULL DEFAULT 'liceo',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "comidas" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pae_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pae_registros" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "comida" TEXT NOT NULL,
    "recibidas" INTEGER NOT NULL,
    "servidas" INTEGER NOT NULL,
    "menu" TEXT,
    "observaciones" TEXT,
    "registradoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pae_registros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pae_registros_fecha_idx" ON "pae_registros"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "pae_registros_fecha_comida_key" ON "pae_registros"("fecha", "comida");


