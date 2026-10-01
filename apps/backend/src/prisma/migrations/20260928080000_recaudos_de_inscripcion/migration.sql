-- LO QUE EL ALUMNO YA ENTREGÓ PARA SU INSCRIPCIÓN
--
-- La lista de recaudos es de cada liceo (academicConfig.inscripcion.recaudos);
-- aquí, lo entregado. Se marca en la ficha cuando llega, no al crear la
-- cuenta. services/inscripcion.service.ts

-- CreateTable
CREATE TABLE "recaudos_entregados" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "recaudo" TEXT NOT NULL,
    "entregadoEl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anotadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recaudos_entregados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recaudos_entregados_studentId_recaudo_key" ON "recaudos_entregados"("studentId", "recaudo");

-- AddForeignKey
ALTER TABLE "recaudos_entregados" ADD CONSTRAINT "recaudos_entregados_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
