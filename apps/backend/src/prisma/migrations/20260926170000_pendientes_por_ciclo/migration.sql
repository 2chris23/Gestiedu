-- UNA MATERIA PENDIENTE POR CICLO EN QUE SE CURSA
--
-- La que no se aprueba en ningún momento y el liceo deja que se arrastre
-- (`pendienteNoAprobada: SIGUE_PENDIENTE`, o el alumno que repite) queda como
-- NO_APROBADA en ese año y nace otra vez en el siguiente, con su historia.
-- Por eso la clave lleva también el año en que se cursa.

-- DropIndex
DROP INDEX "materias_pendientes_studentId_subjectId_cicloDeOrigenId_key";

-- CreateIndex
CREATE UNIQUE INDEX "materias_pendientes_studentId_subjectId_cicloDeOrigenId_cicloId_key" ON "materias_pendientes"("studentId", "subjectId", "cicloDeOrigenId", "cicloId");
