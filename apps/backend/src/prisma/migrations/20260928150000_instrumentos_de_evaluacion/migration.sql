-- LOS INSTRUMENTOS DE EVALUACIÓN (lista de cotejo, escala, rúbrica, puntos)
--
-- Uno por evaluación del plan; la actividad guarda su copia y las marcas.
-- utils/instrumentos.ts

-- AlterTable
ALTER TABLE "class_activities" ADD COLUMN     "detalleDelInstrumento" JSONB,
ADD COLUMN     "instrumento" JSONB;

-- CreateTable
CREATE TABLE "instrumentos_de_evaluacion" (
    "id" TEXT NOT NULL,
    "planRowId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "definicion" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instrumentos_de_evaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instrumentos_de_evaluacion_planRowId_key" ON "instrumentos_de_evaluacion"("planRowId");

-- AddForeignKey
ALTER TABLE "instrumentos_de_evaluacion" ADD CONSTRAINT "instrumentos_de_evaluacion_planRowId_fkey" FOREIGN KEY ("planRowId") REFERENCES "evaluation_plan_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;


