-- LAS FINANZAS DEL LICEO (2026-10-01)
--
-- Cristian: «que sea para manejar sus finanzas». Los fondos del liceo (saldo
-- inicial, donaciones), los gastos sueltos con la foto de su factura, el
-- personal al que se le paga (profesores con cuenta y otro personal sin ella),
-- lo acordado con cada uno por ciclo (cuánto, cada cuánto, sus vacaciones) y
-- los pagos que se le hacen. Nada se borra: se anula con motivo.

-- AlterTable
ALTER TABLE "payment_settings" ADD COLUMN     "categoriasDeGasto" JSONB NOT NULL DEFAULT '["Mantenimiento", "Reparación", "Compras", "Servicios", "Otro"]';

-- CreateTable
CREATE TABLE "fondos_del_liceo" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "moneda" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "tasa" DECIMAL(14,4),
    "montoBase" DECIMAL(12,2) NOT NULL,
    "creadoPorId" TEXT,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fondos_del_liceo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "concepto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "proveedor" TEXT,
    "notas" TEXT,
    "moneda" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "tasa" DECIMAL(14,4),
    "montoBase" DECIMAL(12,2) NOT NULL,
    "comprobanteId" TEXT,
    "creadoPorId" TEXT,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobantes" (
    "id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'image/webp',
    "tamano" INTEGER NOT NULL,
    "subidoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "nombre" TEXT,
    "cedula" TEXT,
    "cargo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "seQuedaParaProximosCiclos" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acuerdos_de_pago" (
    "id" TEXT NOT NULL,
    "personalId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "frecuencia" TEXT NOT NULL DEFAULT 'MENSUAL',
    "diaDePago" INTEGER,
    "fechaUnica" DATE,
    "cobraEnVacaciones" BOOLEAN,
    "bonoVacacional" DECIMAL(12,2),
    "fechaBono" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acuerdos_de_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajustes_de_nomina" (
    "academicYearId" TEXT NOT NULL,
    "diaDePago" INTEGER NOT NULL DEFAULT 31,
    "mesesDeVacaciones" JSONB NOT NULL DEFAULT '[]',
    "cobraEnVacaciones" BOOLEAN NOT NULL DEFAULT true,
    "bonoVacacional" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fechaBono" DATE,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ajustes_de_nomina_pkey" PRIMARY KEY ("academicYearId")
);

-- CreateTable
CREATE TABLE "pagos_al_personal" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "personalId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "metodo" TEXT NOT NULL,
    "referencia" TEXT,
    "notas" TEXT,
    "moneda" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "tasa" DECIMAL(14,4),
    "montoBase" DECIMAL(12,2) NOT NULL,
    "creadoPorId" TEXT,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_al_personal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignaciones_al_personal" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "montoBase" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "asignaciones_al_personal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fondos_del_liceo_fecha_idx" ON "fondos_del_liceo"("fecha");

-- CreateIndex
CREATE INDEX "gastos_fecha_idx" ON "gastos"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "personal_userId_key" ON "personal"("userId");

-- CreateIndex
CREATE INDEX "acuerdos_de_pago_academicYearId_idx" ON "acuerdos_de_pago"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "acuerdos_de_pago_personalId_academicYearId_key" ON "acuerdos_de_pago"("personalId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_al_personal_numero_key" ON "pagos_al_personal"("numero");

-- CreateIndex
CREATE INDEX "pagos_al_personal_personalId_academicYearId_idx" ON "pagos_al_personal"("personalId", "academicYearId");

-- CreateIndex
CREATE INDEX "pagos_al_personal_fecha_idx" ON "pagos_al_personal"("fecha");

-- CreateIndex
CREATE INDEX "asignaciones_al_personal_pagoId_idx" ON "asignaciones_al_personal"("pagoId");

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "comprobantes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal" ADD CONSTRAINT "personal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acuerdos_de_pago" ADD CONSTRAINT "acuerdos_de_pago_personalId_fkey" FOREIGN KEY ("personalId") REFERENCES "personal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acuerdos_de_pago" ADD CONSTRAINT "acuerdos_de_pago_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_de_nomina" ADD CONSTRAINT "ajustes_de_nomina_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_al_personal" ADD CONSTRAINT "pagos_al_personal_personalId_fkey" FOREIGN KEY ("personalId") REFERENCES "personal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_al_personal" ADD CONSTRAINT "pagos_al_personal_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_al_personal" ADD CONSTRAINT "asignaciones_al_personal_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "pagos_al_personal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
