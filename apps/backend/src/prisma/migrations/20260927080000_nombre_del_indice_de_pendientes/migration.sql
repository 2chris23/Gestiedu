-- EL NOMBRE DEL ÍNDICE ÚNICO DE LAS MATERIAS PENDIENTES
--
-- PostgreSQL corta los nombres a 63 letras, y el que puso la migración
-- 20260926170000 quedó distinto del que espera Prisma: sin esto, cada
-- comparación del esquema con la base lo daba como diferencia.

-- RenameIndex
ALTER INDEX "materias_pendientes_studentId_subjectId_cicloDeOrigenId_cicloId" RENAME TO "materias_pendientes_studentId_subjectId_cicloDeOrigenId_cic_key";
