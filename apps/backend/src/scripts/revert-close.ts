/**
 * SCRIPT DE RECUPERACIÓN — REVERTIR CIERRE A MEDIAS (SOLO dev/test)
 *
 * Uso (desde apps/backend):
 *   npx tsx src/scripts/revert-close.ts <instituteId> <yearName|yearId> [--yes]
 *
 * Guard de seguridad: NO corre en producción salvo con --yes explícito.
 *
 * Qué revierte (idempotente):
 *  1. Elimina los AcademicRecord del ciclo indicado.
 *  2. Elimina los enrollments "nuevos" de los estudiantes afectados en años
 *     distintos al ciclo (matrículas de destino creadas por el cierre).
 *  3. Restaura el classroomId de cada estudiante afectado a su aula original
 *     del ciclo (según el enrollment activo de ese ciclo).
 *  4. Desmarca el año: status → ACTIVE, isActive → true.
 *
 * Tras ejecutarlo, el ciclo queda como si nunca se hubiera intentado cerrar
 * (listo para reintentar con la transacción única).
 */
import { PrismaClient } from '@prisma/client';

async function main() {
    const args = process.argv.slice(2);
    const instituteId = args[0];
    const yearRef = args[1];
    const force = args.includes('--yes');

    if (!instituteId || !yearRef) {
        console.error('Uso: npx tsx src/scripts/revert-close.ts <instituteId> <yearName|yearId> [--yes]');
        process.exit(1);
    }

    // Guard de seguridad: se lee NODE_ENV DIRECTAMENTE (sin cargar config/environment,
    // cuyo dotenv puede sobrescribir las variables de entorno del proceso).
    if (process.env.NODE_ENV === 'production' && !force) {
        console.error('⛔ REFUSED: entorno de producción. Añade --yes SOLO si estás seguro.');
        process.exit(1);
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('DATABASE_URL no configurada');
        process.exit(1);
    }
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

    try {
        const year = await prisma.academicYear.findFirst({
            where: {
                // El name del año es único (@@unique([name])) en la tenant DB;
                // los años legacy tienen instituteId NULL, así que no filtramos por él.
                OR: [{ id: yearRef }, { name: yearRef }],
            },
        });
        if (!year) {
            console.error(`Año no encontrado: ${yearRef} (instituto ${instituteId})`);
            process.exit(1);
        }

        console.log(`▶ Revertir cierre de "${year.name}" (${year.id})`);

        // Estudiantes con registro de cierre
        const records = await prisma.academicRecord.findMany({
            where: { academicYearId: year.id },
            select: { studentId: true },
        });
        const studentIds = records.map(r => r.studentId);
        console.log(`  AcademicRecords a eliminar: ${records.length}`);

        // Matrículas de destino (en años distintos al ciclo cerrado)
        const moved = studentIds.length > 0
            ? await prisma.studentClassroom.findMany({
                where: { studentId: { in: studentIds }, academicYearId: { not: year.id } },
                select: { id: true, studentId: true },
            })
            : [];
        console.log(`  Matrículas destino a eliminar: ${moved.length}`);

        // Aula original del ciclo (para restaurar user.classroomId)
        const originals = studentIds.length > 0
            ? await prisma.studentClassroom.findMany({
                where: { studentId: { in: studentIds }, academicYearId: year.id },
                select: { studentId: true, classroomId: true },
            })
            : [];
        const originalByStudent = new Map(originals.map(o => [o.studentId, o.classroomId]));

        await prisma.$transaction(async (tx) => {
            if (studentIds.length > 0) {
                await tx.academicRecord.deleteMany({ where: { academicYearId: year.id } });
                if (moved.length > 0) {
                    await tx.studentClassroom.deleteMany({ where: { id: { in: moved.map(m => m.id) } } });
                }
                for (const [sid, classroomId] of originalByStudent.entries()) {
                    await tx.user.update({ where: { id: sid }, data: { classroomId } });
                }
            }
            await tx.academicYear.update({
                where: { id: year.id },
                data: { status: 'ACTIVE' as any, isActive: true },
            });
        });

        console.log('✔ Ciclo revertido: sin records, matrículas limpias, año de nuevo ACTIVE. Listo para reintentar.');
    } catch (e) {
        console.error('Error al revertir:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
