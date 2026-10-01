-- PostgreSQL corta los nombres a 63 letras: el índice único quedó con un nombre
-- que no es el que Prisma espera (salía como deriva). Se le pone el bueno.
ALTER INDEX "recordatorios_de_cuota_studentId_academicYearId_installmentK_ke" RENAME TO "recordatorios_de_cuota_studentId_academicYearId_installment_key";
